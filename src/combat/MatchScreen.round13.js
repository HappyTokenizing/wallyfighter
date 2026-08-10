// MatchScreen — the heart of WALLY: CRYPTO SMACKDOWN. Owns the match scene,
// round/match flow, hit resolution, combos, meter, throws, finishers, pause and
// every event named in CONTRACTS.md §5. Fighters are kinematic (Fighter.js);
// big hits hand bodies over to the physics ragdoll for comedy.
import * as THREE from 'three'
import { Characters } from '../characters/index.js'
import { Arenas } from '../arenas/index.js'
import { PhysicsManager } from '../physics/PhysicsManager.js'
import { RagdollManager } from '../physics/RagdollManager.js'
import { CameraController } from '../camera/CameraController.js'
import { Fighter } from './Fighter.js'
import { HumanControl } from './HumanControl.js'
import { AIControl } from './AIControl.js'
import { SpecialContext } from './SpecialContext.js'
import { ParticleSystem } from './Particles.js'
import { PropManager } from './Props.js'
import { ReplayManager } from '../replay/ReplayManager.js'
import { showInstantReplay } from '../replay/ReplayUI.js'
// v1.1 parallel-build modules (§14 items, §15 gore). Constructed inside
// try/catch and every call guarded — a broken module NEVER takes a match down.
import { ItemSystem } from '../items/ItemSystem.js'
import { GoreSystem } from './Gore.js'
// v2.0 parallel-build module (§21 KO executions) — stub-guarded at every use.
import { ExecutionPool } from './Executions.js'
// v3.0 render layer (GRAPHICS_CONTRACT §8): the single render entry point.
import { renderScene } from '../render/index.js'
// v3.1: the teardown sweep uses ArenaBase's node freer rather than a second,
// weaker hand-rolled copy. `collectSubtree` snapshots a subtree BEFORE the
// systems that own it start detaching parts of themselves; `disposeNode` frees
// one node's geometry/materials/textures/shadow map while skipping every asset
// that belongs to a global cache and is already promised to the next match.
// (Import direction is safe: ArenaBase pulls in three + src/render only.)
import { collectSubtree, disposeNode } from '../arenas/ArenaBase.js'

// System announcer pools. Character move captions carry per-fighter flavor;
// these carry the broadcast desk. Every pool is drawn through a shuffle bag
// (below) so no line repeats until its whole pool has been heard — the desk
// should never sound canned next to the richly varied move captions.
const KO_LINES = [
  'LIQUIDATED!', 'ABSOLUTELY REKT!', 'PORTFOLIO: ZEROED!',
  'DOWN BAD... FOREVER!', "THAT'S A RUG PULL, FOLKS!", 'MARGIN CALLED INTO OBLIVION!',
]
const COUNTER_LINES = [
  'COUNTER!', 'BUY THE DIP!', 'FRONT RUN!', 'SHORT SQUEEZED!',
  'REVERSAL! THE CHART FLIPS!', 'CALLED THE TOP!', 'INSIDER TIMING!',
]
// '{W}' is replaced with the winner's name.
const WIN_LINES = [
  '{W} WINS! TO THE MOON!',
  '{W} WINS! SHAREHOLDERS HAVE BEEN NOTIFIED!',
  '{W} CLOSES THE POSITION!',
  '{W} WINS! ALL-TIME HIGH!',
  '{W} TAKES THE WHOLE ORDER BOOK!',
  '{W} WINS! PRICE DISCOVERY COMPLETE!',
  '{W} WINS! THE DIP HAS BEEN BOUGHT!',
]
const FIRST_HIT_LINES = [
  'FIRST HIT... FIRST PROFIT!',
  'OPENING BELL, OPENING BRUISE!',
  'EARLY ENTRY! GREAT PRICE!',
  'FIRST BLOOD IS ON THE LEDGER!',
  'SOMEONE JUST GOT DOLLAR-COST AVERAGED!',
  'THE FIRST TRADE PRINTS!',
]
const COMBO5_LINES = [
  'DIAMOND HANDS COMBO!',
  'FIVE HITS! COMPOUND INTEREST!',
  'FIVE GREEN CANDLES IN A ROW!',
  'COMBO STREAK! UP ONLY!',
  'THAT COMBO IS BEATING THE INDEX!',
  'RELENTLESS! NO STOP LOSS IN SIGHT!',
]
const TIMEOUT_LINES = [
  'TIME! THE MARKET IS CLOSED!',
  'TIME! TRADING HALTED!',
  'CLOSING BELL! COUNT THE CANDLES!',
  "TIME'S UP! SETTLEMENT BY JUDGES!",
  'MARKET CLOSE! CHECK THE LEDGER!',
  'TIME EXPIRES! POSITIONS SETTLE WHERE THEY STAND!',
]

// Shuffle bag: deal from a shuffled copy until empty, then reshuffle — and
// never deal the same line twice in a row across refills. Bags live at module
// scope so the no-repeat guarantee spans a whole play session, not one match.
class ShuffleBag {
  constructor(items) { this.items = items; this.bag = []; this.last = null }
  next() {
    if (!this.bag.length) {
      this.bag = this.items.slice()
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        ;[this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]
      }
      const top = this.bag.length - 1
      if (top > 0 && this.bag[top] === this.last) {
        const j = (Math.random() * top) | 0
        ;[this.bag[top], this.bag[j]] = [this.bag[j], this.bag[top]]
      }
    }
    this.last = this.bag.pop()
    return this.last
  }
}
const BAGS = {
  ko: new ShuffleBag(KO_LINES),
  counter: new ShuffleBag(COUNTER_LINES),
  win: new ShuffleBag(WIN_LINES),
  firstHit: new ShuffleBag(FIRST_HIT_LINES),
  combo5: new ShuffleBag(COMBO5_LINES),
  timeout: new ShuffleBag(TIMEOUT_LINES),
}
const KIND_SFX = { light: 'punch_light', heavy: 'punch_heavy', kick: 'kick', launcher: 'launch', special: 'punch_heavy', super: 'explosion', joke: 'boing', grab: 'grab' }
// §23: killing-blow move kind -> execution tier
const TIER_FOR_KIND = {
  light: 'basic', kick: 'basic', joke: 'basic',
  heavy: 'heavy', launcher: 'heavy', grab: 'heavy', throw: 'heavy',
  special: 'absurd', super: 'absurd',
}
// §23: per-tier safety caps (frames) — scripts must end themselves well before
const TIER_CAP = { basic: 220, heavy: 300, absurd: 480 }
// §27: fighter primary colors for crowd tinting — def.primaryColor wins; this
// inline fallback covers the shipped roster (+ the story boss form).
const PRIMARY_COLOR_FALLBACK = {
  wally: 0x8fa5c8, dogey: 0xe8b34b, peepee: 0x53b04a, shibro: 0xd97b29,
  'tired-ape': 0x8a5a33, 'fatty-pingo': 0x2e3a52, bonko: 0xd94f2a,
  'crypto-punkd': 0x54c7c9, 'cool-pal': 0x5a8dee, 'blackish-bull': 0x8b1f24,
  'blackish-bull-unchained': 0xa01820,
}
const KNOWN_MODES = new Set(['versus', 'training', 'story', 'arcade', 'exhibition'])
const FIXED_STEP = 1 / 60
// States a fighter may use a held item from (§14): grounded-ish neutral only —
// never mid-attack, stunned, grabbed, ragdolled or during a finisher.
const ITEM_OK_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'jump'])
// §17: hit detection is distance + attacker-facing cone (~70° total) + height
const COS_HALF_CONE = Math.cos((70 * Math.PI / 180) / 2)
// §17: arena z bounds default when the arena doesn't specify them
const DEFAULT_MIN_Z = -5.5
const DEFAULT_MAX_Z = 5.5
// OTG hits (v2.1 mobile-feel pass): a downed fighter (grounded/settled ragdoll
// or knockdown — never ko/finisher, both live outside phase 'fight') becomes
// hittable OTG_FRAMES (1.5s) after the fall started. Attacks connect against a
// low wide prone hurtbox, deal normal damage, and the FIRST OTG hit of a fall
// forces an immediate getup with OTG_GETUP_INVULN frames of invulnerability —
// the otgHit latch guarantees a knockdown can never eat two OTG hits.
const OTG_FRAMES = 90
const OTG_GETUP_INVULN = 45
const OTG_PRONE_HEIGHT = 1.0      // prone hurtbox vertical band (y0=0..this) —
                                  // tall enough that standard jab/kick bands
                                  // (band bottom ~0.3-0.95 across the roster)
                                  // connect; genuinely high swings still whiff
const OTG_PRONE_RADIUS_MULT = 1.5 // a body on the floor is wide, not tall
const _otgV = new THREE.Vector3()

// ---- presentation-only constants (swing ribbon + extension hold) ----------
// Fixed frames BEFORE the active window that the ribbon starts tracking. The
// feel critic asked for "the 3-4 startup frames"; 4 is the top of that range
// and gives a 5-6 sample arc once the active frames are included.
const RIBBON_LEAD = 4
// [tipBone, parentBone, overshoot] — see _strikeTip(). The overshoot extends
// past the elbow/knee by a fraction of the parent segment, because the roster
// has no hand or foot bones to read directly.
const STRIKE_LIMBS = [
  ['forearmR', 'armR', 1.0], ['forearmL', 'armL', 1.0],
  ['shinR', 'legR', 0.85], ['shinL', 'legL', 0.85],
  ['armR', 'torso', 0.0], ['armL', 'torso', 0.0],
]
const _tipV = new THREE.Vector3()
// Clip phases probed during the extension hold, as fractions of the
// [contact, active-end + overshoot] window. Seven samples: the search runs once
// per landed hit, inside a frame the sim has already frozen.
const EXT_PROBES = [0, 0.2, 0.38, 0.55, 0.72, 0.86, 1]
// How far the held strike tip may sit from the hitbox contact point, along the
// attacker->victim axis. The acceptance for the extension hold is "within
// 0.15 m of the contact point", so that is the number, not a taste call: a pose
// that reaches further is no longer showing the frame where the limb met the
// victim, it is showing the follow-through past him. It is a HARD GATE rather than a penalty term, because the acceptance is a
// hard bound: a soft penalty lets a probe 1 cm outside the band outscore one
// comfortably inside it, which is a measured fail for a rounding's worth of
// extra reach.
const EXT_OVERSHOOT = 0.15
// Two reaches within this (metres) are the same pose as far as the objective is
// concerned, and the silhouette width breaks the tie.
const EXT_REACH_EPS = 0.004

// --- foot bones -------------------------------------------------------------
// The ladder lighting.js's own discoverFeet() uses to turn a CharacterDef bone
// map into "the node closest to the sole", mirrored here so MatchScreen can
// tell whether a character HAS such a node before it hands the map over — and
// so it can say out loud which characters do not. Keys are matched, not node
// names; the roster is legL/legR (+ shinL/shinR on most) with no foot or ankle
// bone anywhere, so this normally resolves to the shin or leg rung.
const FOOT_BONE_RANK = [
  [/^(foot|toe|sole|paw|hoof|shoe|boot)/i, 3],
  [/^(ankle)/i, 3],
  [/^(shin|calf)/i, 2],
  [/^(leg|thigh)/i, 1],
]

export class MatchScreen {
  constructor() {
    this.active = false
    // §23: last KO-execution id PER TIER — persists across matches on the
    // screen instance so no tier repeats back-to-back even between matches.
    this.lastExecutionIds = { basic: null, heavy: null, absurd: null }
  }

  // ------------------------------------------------------------------ screen

  enter(params = {}) {
    const game = this.game
    this.params = params
    // unknown mode strings degrade gracefully to versus rules
    this.mode = KNOWN_MODES.has(params.mode) ? params.mode : 'versus'
    this.rules = { ...game.config.rules, ...(params.rules || {}) }

    // P0 (v3.1) ORDERING — THIS MUST BE THE FIRST THING enter() DOES.
    // When a match ends with replay footage the visual teardown is DEFERRED: the
    // frozen KO scene is handed to the results screen and swept here. It used to
    // be swept two hundred lines down, i.e. AFTER the next arena had already
    // built, dressed the new scene and claimed the module-level arena state — so
    // arena N-1's teardown ran on top of arena N's setup. That is one of the two
    // ways a previous venue's mood could bleed into the next match. Arena N-1 is
    // now completely gone before arena N is even conceived.
    try { game.__lastReplay?.dispose?.() } catch { /* stale */ }
    game.__lastReplay = null

    // Per-MATCH latches. ScreenManager reuses this MatchScreen instance for every
    // match, so anything set once and never cleared silently disables itself for
    // the rest of the session — `_contactsDone` meant only the first match of a
    // session ever got contact shadows under its fighters.
    this._contactsDone = false
    this._rigWarned = false
    this._shadowRadius = 0

    // --- scene & camera ---
    this.scene = new THREE.Scene()
    // Explicit, unconditional atmosphere. Nothing is inherited and nothing is
    // restored-from-previous: the arena build clears and re-applies environment
    // and fog on top of this (ArenaBase.resetSceneRenderState).
    this.scene.background = new THREE.Color(0x181c38)
    this.scene.environment = null
    this.scene.fog = null
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400)
    this.camera.position.set(0, 2.7, 11.5)
    this.camera.lookAt(0, 1.4, 0)

    // Bright arcade lighting — v3.0: now a FALLBACK, not an always-on layer.
    //
    // Every arena builds a composed key/fill/rim/bounce rig with a shadow
    // camera fitted to the action (ArenaBase.makeLightRig -> makeCinematicRig).
    // Leaving this second hemisphere + second shadow-casting sun in the scene
    // on top of it would (a) flatten every arena's deliberate lighting design
    // back into the old uniform wash, and (b) cost a second full shadow map
    // whose fixed ±14 frustum fights the rig's tight one. So it is built here
    // and only BUILT BELOW, after the arena build, if the arena gave us no rig
    // (stub arenas, a build that threw, the fallback floor path). v3.1: it is
    // CONSTRUCTED lazily too — building a shadow-casting DirectionalLight and
    // then dropping it on the floor every match was a small per-match leak of a
    // shadow camera and map-size allocation for nine matches out of ten.
    const buildFallbackLights = () => {
      const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x54381e, 0.85)
      const sun = new THREE.DirectionalLight(0xfff2d0, 1.6)
      sun.position.set(6, 12, 7)
      if (game.quality.shadows) {
        sun.castShadow = true
        sun.shadow.mapSize.set(game.quality.shadowSize, game.quality.shadowSize)
        sun.shadow.camera.left = -14
        sun.shadow.camera.right = 14
        sun.shadow.camera.top = 14
        sun.shadow.camera.bottom = -2
        sun.shadow.camera.near = 1
        sun.shadow.camera.far = 40
      }
      this.scene.add(hemi)
      this.scene.add(sun)
      this.scene.add(sun.target)
    }

    // --- physics + arena ---
    const presetName = game.save.get('settings.physicsPreset', 'standard')
    this.physics = new PhysicsManager(game, presetName)
    this.presetCfg = game.config.physicsPresets[presetName] || game.config.physicsPresets.standard
    this.ragdolls = new RagdollManager(this.physics, game)

    // --- fighter specs (resolved early: the arena build needs the fighter
    // colors, §27) ---
    const specs = [
      { charId: 'wally', control: 'p1', costume: 0, ...(params.p1 || {}) },
      { charId: 'dogey', control: 'ai', aiLevel: 2, costume: 0, ...(params.p2 || {}) },
    ]
    if (this.mode === 'versus') {
      // v1.1 (§16): local 2-player is REMOVED — versus is ALWAYS human vs CPU.
      // The select screen sends control:'ai' now, but enforce it here too so a
      // stale params blob can never resurrect P2-keyboard versus.
      if (specs[1].control !== 'ai') {
        console.debug(`[combat] versus: p2 control '${specs[1].control}' overridden to 'ai' (local 2P removed, §16)`)
      }
      specs[1].control = 'ai'
      specs[1].aiLevel = params.p2?.aiLevel ?? 3
    }
    if (this.mode === 'exhibition') {
      // exhibition is always bots vs bots, whatever the params claim
      for (let i = 0; i < specs.length; i++) {
        const s = specs[i]
        if (s.control !== 'ai') {
          console.debug(`[combat] exhibition: p${i + 1} control '${s.control}' overridden to 'ai' (exhibition is always bots vs bots)`)
        }
        s.control = 'ai'
        s.aiLevel = s.aiLevel || 3
      }
    }
    // §27: primary color per fighter — crowd tinting (buildCrowd reads
    // ctx.fighterColors), def.primaryColor with an inline roster fallback.
    this.fighterColors = specs.map((spec) =>
      Characters[spec.charId]?.primaryColor ?? PRIMARY_COLOR_FALLBACK[spec.charId] ?? 0xd8d8d8)

    const arenaDef = Arenas[params.arenaId] || Object.values(Arenas)[0]
    this.arenaId = arenaDef?.id || params.arenaId || 'meme-market'
    let arena = null
    try {
      arena = arenaDef.build({
        scene: this.scene, physics: this.physics, quality: game.quality,
        events: game.events, audio: game.audio, fighterColors: this.fighterColors,
        // v3.0: ArenaBase needs the id (to pick its env.js mood) and the
        // renderer (to build the PMREM environment). Both are additive — an
        // arena that ignores them behaves exactly as before.
        arenaId: this.arenaId, renderer: game.renderer,
      })
    } catch (e) { console.error('[combat] arena build threw', e) }
    this.arena = arena || { group: null, bounds: { minX: -9, maxX: 9, wallBounce: 0.55 }, floorY: 0, spawnPoints: [-3, 3], update() {}, dispose() {} }
    // P0 (v3.1) — the arena group must be the SINGLE root everything hangs from,
    // or teardown cannot be exhaustive and dressing carries into the next venue
    // (the reserve-core floor decal that turned up on the swamp pier). This is
    // the only safe moment to reconcile that: the arena has finished building
    // and NOTHING else has been added to the scene yet — fighters, particles,
    // props, items and the fallback lights all come after this line.
    try { this.arena.adoptSceneStrays?.() } catch (e) { console.warn('[combat] adoptSceneStrays threw', e) }
    if (this.arena.group && !this.arena.group.parent) this.scene.add(this.arena.group)
    // §17: bounds cover the whole floor — z walls default in when the arena
    // only declares the v1 x-lane bounds.
    this.bounds = {
      minX: -9, maxX: 9, minZ: DEFAULT_MIN_Z, maxZ: DEFAULT_MAX_Z, wallBounce: 0.55,
      ...(this.arena.bounds || {}),
    }
    if (!Number.isFinite(this.bounds.minZ)) this.bounds.minZ = DEFAULT_MIN_Z
    if (!Number.isFinite(this.bounds.maxZ)) this.bounds.maxZ = DEFAULT_MAX_Z
    try {
      this.physics.setArenaBounds?.(this.bounds)
      this.physics.floorY = this.arena.floorY ?? 0
    } catch { /* physics bounds are optional */ }
    if (arenaDef?.stub || !this.arena.group) this._buildFallbackFloor()

    // See the "bright arcade lighting" note above: only light the scene
    // ourselves when the arena did not.
    if (!this.arena.rig) buildFallbackLights()
    // The rim light is camera-relative this round — hand the rig the camera once
    // at setup so the very first rendered frame is already composed, instead of
    // waiting for the first _updatePresentation.
    try { this.arena.rig?.setCamera?.(this.camera) } catch { /* optional */ }

    // --- pools ---
    this.particles = new ParticleSystem(this.scene, game.quality)
    // Presentation only. The pool uses the lens for two things: pushing the
    // contact cluster in front of the victim instead of into his chest, and
    // keeping the swing ribbons broadside. Neither touches the sim.
    try { this.particles.setCamera(this.camera) } catch { /* pool is defensive */ }
    this.props = new PropManager(this.scene, this.physics)

    // --- fighters ---
    this.fighters = specs.map((spec, slot) => {
      const ctrl = spec.control === 'ai'
        ? new AIControl(spec.aiLevel)
        : new HumanControl(game.input, spec.control === 'p2' ? 1 : 0)
      const def = Characters[spec.charId]
      const f = new Fighter(this, slot, def, ctrl, spec.costume || 0)
      this.scene.add(f.root)
      return f
    })
    // §18: the camera tracks the human slot (slot 0 in AI-vs-AI exhibitions)
    const humanSlot = specs.findIndex((s) => s.control !== 'ai')
    this.trackedSlot = humanSlot >= 0 ? humanSlot : 0
    this.fighters[0].foe = this.fighters[1]
    this.fighters[1].foe = this.fighters[0]
    for (const f of this.fighters) {
      try { this.ragdolls.build(f) } catch (e) { console.warn('[combat] ragdoll build failed', e) }
    }
    // hand the roster to the arena so hazards can target fighters directly
    // (additive hook — arenas read it defensively)
    try { this.arena.setFighters?.(this.fighters) } catch (e) { console.warn('[combat] arena.setFighters threw', e) }
    // hand the camera to the arena too (volumetric beams fade near the lens)
    try { this.arena.setCamera?.(this.camera) } catch (e) { console.warn('[combat] arena.setCamera threw', e) }

    // dark venues opt into a per-fighter fill + rim rig (the PS2 trick): a
    // front fill keeps dark costumes readable, a rear rim keeps silhouettes.
    // Lights ride f.root so they travel with the fighter; arena declares
    // arena.fighterFill = { color, intensity, rimColor, rimIntensity }.
    const ff = this.arena.fighterFill
    if (ff) {
      for (const f of this.fighters) {
        const fill = new THREE.PointLight(ff.color ?? 0xffffff, ff.intensity ?? 3, 9, 2)
        fill.position.set(0, 1.6, 2.3)  // camera side, chest height
        f.root.add(fill)
        const rim = new THREE.PointLight(ff.rimColor ?? 0x8fb7ff, ff.rimIntensity ?? 2.6, 8, 2)
        rim.position.set(0, 2.3, -1.9)  // high behind — silhouette edge light
        f.root.add(rim)
      }
    }

    // --- v1.1 item system (§14) — parallel build, fully guarded ---
    this.items = null
    this._groundItems = [] // mirror of ground items (via events) for the AI heuristic
    try {
      this.items = new ItemSystem({
        game,
        scene: this.scene,
        physics: this.physics,
        arena: this.arena,
        arenaId: this.arenaId,
        fighters: this.fighters,
        events: game.events,
      })
    } catch (e) { console.warn('[combat] ItemSystem init failed — match runs without items', e); this.items = null }
    this._offItemSpawn = game.events.on('item:spawned', (e) => {
      if (e && e.pos) this._groundItems.push({ kind: e.kind, x: e.pos.x ?? 0 })
    })
    this._offItemPickup = game.events.on('item:pickup', (e) => this._dropGroundItem(e?.kind))
    this._offItemDespawn = game.events.on('item:despawn', (e) => this._dropGroundItem(e?.kind))
    // ItemSystem clears its ground items silently on round:start (no despawn
    // events) — drop the mirror too or the AI steers toward phantoms in R2+.
    this._offItemRound = game.events.on('round:start', () => { this._groundItems.length = 0 })

    // --- v1.1 gore system (§15) — parallel build, fully guarded ---
    this.gore = null
    try { this.gore = new GoreSystem(this) } catch (e) { console.warn('[combat] GoreSystem init failed — match runs gore-free', e); this.gore = null }

    // --- camera controller ---
    this.cam = new CameraController(this.camera, game)
    try {
      this.cam.setFighters(this.fighters[0], this.fighters[1])
      this.cam.setBounds(this.bounds)
      this.cam.setMode('match')
      // §18: fixed tracking third-person — the camera follows the player's
      // fighter around the whole stadium (duck-typed; camera module parallel)
      this.cam.setTracked?.(this.fighters[this.trackedSlot])
      // P0 (v1.1.1): arena dressing between the lens and a fighter fades to
      // ~25% opacity — corner fights stay readable behind stalls and crates
      this.cam.setOccluders?.(this.arena.group)
    } catch (e) { console.warn('[combat] camera setup failed', e) }

    // --- instant replay recorder (src/replay) ---
    // (the previous match's preserved clip was already swept at the top of
    // enter(), before the arena built — see the P0 ORDERING note there)
    this.replay = null
    try {
      this.replay = new ReplayManager(game)
      this.replay.start(this)
    } catch (e) { console.warn('[combat] replay init failed', e); this.replay = null }
    this.replayActive = false
    this._replayUI = null
    this._replayFinish = null
    this._replayPlayed = false
    this._preserveForReplay = false

    // --- flow state ---
    this.phase = 'intro'
    this.round = 0
    this.wins = [0, 0]
    this.roundsData = []
    // whole-match, per-slot stats for the results card (never reset per round)
    this.matchStats = { maxCombo: [0, 0], damageDealt: [0, 0] }
    this.finisherUsed = false
    // §23: the FINISHER! prompt/chord flow is gone. This dead array stays so
    // legacy pokes (Tutorial pins, AI peeks) stay harmless no-ops.
    this.finisherReady = [false, false]
    // §23 auto-execution state
    this._killBlow = null
    this._execFx = null
    this._execA = null
    this._execD = null
    this._execSkipFrame = 0
    this._offAnyInput = game.events.on('input:any', () => this._skipExecution())
    this._onPointerSkip = () => this._skipExecution()
    if (typeof window !== 'undefined') window.addEventListener('pointerdown', this._onPointerSkip)
    this.matchStartEmitted = false
    this.firstHitDone = false
    this.paused = false
    this.worldFrame = 0
    this.timers = []
    this.fxList = []
    this.timeScale = 1
    this._acc = 0
    this._tickAcc = 0
    this.hitStopFrames = 0
    this.slowmoFrames = 0
    this.timeLeft = this.rules.roundTime * 60
    this._lastTimerSecond = -1
    this._sayLog = new Map()

    // §20: story chapter 1 doubles as the controls tutorial. The module is a
    // parallel build — lazy dynamic import, fully guarded, so a missing or
    // broken Tutorial.js can never take the match down.
    this.tutorial = null
    this._tutorialWanted = !!this.rules.tutorial
    if (this._tutorialWanted) {
      import('../modes/Tutorial.js').then((mod) => {
        if (!this.active || !this._tutorialWanted) return
        if (this.tutorial && !this.tutorial.disposed) return // StoryMode's net won the race
        const TD = mod?.TutorialDirector
        if (typeof TD !== 'function') return
        try { this.tutorial = new TD(this, game) } catch (e) {
          console.warn('[combat] TutorialDirector init failed — match runs without tutorial', e)
          this.tutorial = null
        }
      }).catch((e) => console.warn('[combat] tutorial module unavailable', e))
    }

    this._offPause = game.events.on('input:pause', () => this._togglePause())
    this._offResume = game.events.on('match:resume', () => { if (this.paused) this._togglePause() })
    this._offResize = game.events.on('resize', ({ w, h }) => {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    })

    game.audio.music(arenaDef?.music || 'battle_meme_market')
    this.active = true
    // #6: brand new scene, brand new arena, brand new camera. Whatever the
    // pipeline is holding from the last screen is a ghost of a different venue.
    this._cut()
    this.startRound(1)
  }

  exit() {
    this.active = false
    if (this.replayActive) this._abortInstantReplay(false)
    try { this._flushFx() } catch { /* teardown */ }
    this._offPause?.()
    this._offResize?.()
    this._offResume?.()
    this._offPause = this._offResize = this._offResume = null
    this._offAnyInput?.()
    this._offAnyInput = null
    if (this._onPointerSkip && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._onPointerSkip)
    }
    this._onPointerSkip = null
    this._execFx = null
    this._execA = this._execD = null
    this._offItemSpawn?.()
    this._offItemPickup?.()
    this._offItemDespawn?.()
    this._offItemRound?.()
    this._offItemSpawn = this._offItemPickup = this._offItemDespawn = this._offItemRound = null
    // v2.0 tutorial director (§20) goes first — it owns DOM objective cards
    this._tutorialWanted = false
    try { this.tutorial?.dispose?.() } catch (e) { console.warn('[combat] tutorial dispose threw', e) }
    this.tutorial = null
    // v1.1 systems go first, while scene/physics still exist for their cleanup
    try { this.items?.dispose?.() } catch (e) { console.warn('[combat] items dispose threw', e) }
    this.items = null
    this._groundItems = []
    try { this.gore?.dispose?.() } catch (e) { console.warn('[combat] gore dispose threw', e) }
    this.gore = null
    this.game.audio.stopMusic()

    // When the match produced replay footage, the visual teardown is DEFERRED:
    // the frozen KO scene is handed to the clip-mode viewer (results screen)
    // and swept by ReplayManager.dispose() when the next match starts.
    const preserve = !!(this._preserveForReplay && this.replay?.captureAvailable())
    const scene = this.scene
    const { fighters, props, particles, arena } = this
    const visualTeardown = () => {
      // P1 (v3.1) GEOMETRY/TEXTURE LEAK ON RESTART — SNAPSHOT BEFORE ANYONE
      // DETACHES ANYTHING. The old sweep read `scene.children` AFTER the
      // fighters, props, particles and arena had all torn themselves down, and
      // every one of those legitimately detaches part of its tree on the way
      // out (Fighter.dispose removes its root, ParticleSystem empties its pools,
      // ArenaBase clears the rig group). Anything detached before the walk is
      // unreachable by a traverse, so its geometry stayed resident and unfreed
      // — draw calls flat, geometry count climbing, forever. Take the flat
      // snapshot first; dispose the snapshot, not the survivors.
      const owned = []
      if (scene) { try { collectSubtree(scene, owned) } catch { /* best effort */ } }

      for (const f of fighters || []) { try { f.dispose(scene) } catch { /* gone */ } }
      try { props?.dispose() } catch { /* gone */ }
      try { particles?.dispose() } catch { /* gone */ }
      try { arena?.dispose?.() } catch (e) { console.warn('[combat] arena dispose threw', e) }

      // sweep whatever is left (lights, fallback floor, stray props)
      if (scene) {
        const leftovers = [...scene.children]
        for (const o of leftovers) scene.remove(o)
        for (const o of leftovers) { try { collectSubtree(o, owned) } catch { /* fine */ } }
        // disposeNode() is ArenaBase's node freer and it closes three holes the
        // hand-rolled walk here had:
        //   * it frees geometry on Points / Line / Sprite / InstancedMesh too,
        //     not only `isMesh` — the particle and debris pools are Points;
        //   * it frees the TEXTURES a material exclusively owns (the old walk
        //     disposed materials but never their maps — that is the "+3
        //     textures per restart" half of the bug);
        //   * it frees light shadow maps, and it skips shared assets (pbr()
        //     cache materials, surfaceMaps() textures, PMREM environments, the
        //     shared crowd geometry) which the NEXT match is already using.
        // It latches `userData.__disposed`, so overlapping snapshots are free.
        for (const o of owned) { try { disposeNode(o) } catch { /* fine */ } }
      }
    }
    if (!preserve) {
      try { this.replay?.dispose?.() } catch { /* fine */ }
      visualTeardown()
    }
    try { this.cam?.dispose?.() } catch (e) { console.warn('[combat] camera dispose threw', e) }
    try { this.ragdolls?.dispose?.() } catch (e) { console.warn('[combat] ragdolls dispose threw', e) }
    try { this.physics?.dispose?.() } catch (e) { console.warn('[combat] physics dispose threw', e) }
    if (preserve) {
      this.replay.preserve(visualTeardown)
      this.game.__lastReplay = this.replay
    }
    this.replay = null
    this.scene = null
    this.fighters = []
    this.fxList = []
    this.timers = []
    // #6 + hygiene: this screen is gone. Drop the focus targets (they point at
    // fighters that no longer exist, and the pipeline would keep easing toward
    // them under the next screen) and clear the temporal history so the results
    // screen never inherits a ghost of the KO frame.
    try { this.game?.pipeline?.autoFocus?.(null) } catch { /* optional */ }
    this._focusA = this._focusB = this._focusMid = null
    this._cut()
  }

  // GRAPHICS_CONTRACT §8. Exactly one composer render per frame: Game's loop
  // calls screens.render() once, this is the only draw in it, and renderScene()
  // routes it through game.pipeline (falling back to a direct render if the
  // post stack ever fails).
  render(renderer, dt = 1 / 60) {
    if (this.scene && this.camera) renderScene(this.game || renderer, this.scene, this.camera, dt)
  }

  // ------------------------------------------------------------ presentation
  // Everything here is post/lighting only — it touches no simulation state and
  // runs on the RENDER cadence, not the fixed clock, so it is frame-rate
  // independent and cannot change a single gameplay outcome.
  _updatePresentation(dt) {
    const [a, b] = this.fighters || []
    const mid = this._focusMid || (this._focusMid = new THREE.Vector3())
    if (a && b) mid.copy(a.pos).add(b.pos).multiplyScalar(0.5)
    else if (a) mid.copy(a.pos)
    else mid.set(0, 1, 0)
    mid.y += 1.05   // chest height reads better than the floor for both DoF and shadows

    // Depth of field (contract §7 pass 5). TWO targets, not the midpoint: the
    // Pipeline fits the in-focus band to span both fighters plus a margin, so
    // the far fighter is never the blurry one at long range — which is exactly
    // what a midpoint-only focus does as the pair separates. Both vectors are
    // persistent and rewritten in place; the pipeline holds the references.
    const pipeline = this.game?.pipeline
    if (pipeline) {
      try {
        if (a && b) {
          const fa = this._focusA || (this._focusA = new THREE.Vector3())
          const fb = this._focusB || (this._focusB = new THREE.Vector3())
          fa.copy(a.pos); fa.y += 1.05
          fb.copy(b.pos); fb.y += 1.05
          pipeline.autoFocus(fa, fb)
        } else {
          pipeline.autoFocus(mid)
        }
      } catch { /* pipeline is optional */ }
    }

    // Fit the shadow frustum and swing the rim onto the action. The rig is a
    // makeCinematicRig handle parked by ArenaBase.makeLightRig; arenas that
    // never built one simply skip this.
    //
    // P0 (v3.1) — DO NOT DEFEAT THE TEXEL SNAP. Two rules, both learned the
    // hard way:
    //  1. This runs on the RENDER cadence, once per frame — never per fixed
    //     step. Driving the shadow frustum 1-5 times per frame with different
    //     radii re-snaps the box mid-frame for nothing.
    //  2. `fitTo(a, b)` is the ONE call that sets focus AND radius, and
    //     lighting.js quantises the radius inside its `shadowRadius` setter
    //     (0.5 m steps + hysteresis) precisely so the texel grid holds still.
    //     Passing `mid` to update() as well would immediately overwrite the
    //     focus fitTo just computed with a slightly different, unquantised
    //     point — so update() gets a null focus here and only the camera.
    //     Solo/edge cases (a fighter missing) still hand update() the midpoint.
    const rig = this.arena?.rig
    if (rig && typeof rig.update === 'function') {
      try {
        if (a && b) {
          rig.fitTo(a.pos, b.pos)
          rig.update(dt, null, this.camera)
        } else {
          rig.update(dt, mid, this.camera)
        }
      } catch (e) {
        if (!this._rigWarned) { this._rigWarned = true; console.warn('[combat] light rig update threw — disabling', e) }
        this.arena.rig = null
      }
    }
  }

  // -------------------------------------------------------------------------
  // _cut() — v3.1 (#6). Tell the post pipeline that the NEXT frame has no
  // relationship to the last one, so the afterimage/motion-blur history and the
  // ultra accumulator are cleared instead of smearing the old shot across the
  // cut. Pipeline.resetHistory() only sets a flag (the GL clear happens once, at
  // the top of the next render), so calling it on every candidate cut is free.
  //
  // Call sites, all of them hard cuts: arena/scene change (enter), round
  // transitions (startRound), the KO cinematic, the execution cinematic, and
  // both ends of the instant replay — the replay camera teleports to its orbit
  // rig and teleports back to live.
  // -------------------------------------------------------------------------
  _cut() {
    try { this.game?.pipeline?.resetHistory?.() } catch { /* pipeline is optional */ }
    // A swing ribbon that survives a camera teleport is a smear across the cut.
    try { this.particles?.clearSwings?.() } catch { /* pool is optional */ }
  }

  // ---------------------------------------------------------------------------
  // A contact-shadow disc under each fighter so nobody floats (contract §6).
  //
  // ROUND 13 — THE HERO CHARACTER WAS THE LEAST GROUNDED THING IN THE GAME, and
  // this call site is why. It used to hand lighting.js `{ radius, groundY }` and
  // NO BONE MAP. addContactShadow() passes `o.bones` straight to discoverFeet(),
  // which without one falls back to a purely geometric probe: the two lowest
  // meshes in the subject's local space, clustered laterally. On WALLY that
  // picks `merged-0` and `tailSeg3` — a merged static mesh and a TAIL segment —
  // and probes a sole at 0.4334 m. Everything downstream is then correct about
  // the wrong number: the sole probe re-bases the disc plane upward, the crevice
  // term paints on his shins and as a band near the horizon, and the discs
  // measured 43.8-45.9 cm off the floor in ALL TEN arenas.
  //
  // The fix is one option. Every CharacterDef exposes legL/legR (CONTRACTS.md
  // §4 guarantees them) and most also expose shinL/shinR; lighting's FOOT_RANK
  // prefers the shin because it is nearer the sole, then localContactPoint()
  // measures only the bottom SOLE_BAND of that node's subtree, so a leg-rung
  // bone still yields a true sole. Nothing in the roster has a foot or ankle
  // bone and nothing needs one.
  //
  // We pass a FILTERED map (the best-ranked node per side under the same
  // ladder) rather than the whole bone map, for two reasons: it keeps a future
  // accessory bone that happens to start with "leg"/"shin" out of the probe,
  // and it lets us detect the genuine no-foot-bone case HERE, log it by
  // character id, and fall through to the geometric probe deliberately instead
  // of by accident.
  //
  // Idempotent by construction on lighting's side too (addContactShadow returns
  // the existing handle for a target it already knows), so the `_contactsDone`
  // latch is belt-and-braces.
  // ---------------------------------------------------------------------------
  _attachContactShadows() {
    const rig = this.arena?.rig
    if (!rig || typeof rig.addContactShadow !== 'function' || this._contactsDone) return
    this._contactsDone = true
    for (const f of this.fighters || []) {
      const obj = f?.root
      if (!obj) continue
      const bones = this._soleBoneMap(f)
      if (!bones) {
        // Not a warning about a broken rig — a statement about which characters
        // are running on the geometric probe, which is the thing that was
        // silently true for the whole roster until now.
        console.warn(`[combat] contact shadows: no foot/shin/leg bone on '${f?.def?.id ?? '(unknown)'}' — falling back to the geometric sole probe`)
      }
      const opts = { radius: 0.68, groundY: this.arena?.floorY ?? 0 }
      if (bones) opts.bones = bones
      try { rig.addContactShadow(obj, opts) } catch { /* optional */ }
    }
  }

  /**
   * The sole-bearing bone per side, under FOOT_BONE_RANK, in the shape
   * lighting.js's discoverFeet() wants: a plain `{ boneName: Object3D }` map
   * whose keys end in 'L'/'R'. Returns null when the rig genuinely exposes no
   * such bone, which is the caller's cue to log and let the geometric probe
   * have it. Original key names are kept so the rig's own diagnostics
   * (`feetVia`, `rank`, `nodeName`) stay truthful about which rung resolved.
   */
  _soleBoneMap(f) {
    const bones = f && f.bones
    if (!bones) return null
    const out = {}
    let n = 0
    for (const side of ['L', 'R']) {
      let bestKey = null
      let bestRank = 0
      for (const k of Object.keys(bones)) {
        if (!k.endsWith(side) || !bones[k]) continue
        for (let i = 0; i < FOOT_BONE_RANK.length; i++) {
          const rank = FOOT_BONE_RANK[i][1]
          if (rank > bestRank && FOOT_BONE_RANK[i][0].test(k)) { bestKey = k; bestRank = rank }
        }
      }
      if (bestKey) { out[bestKey] = bones[bestKey]; n++ }
    }
    return n ? out : null
  }

  update(dt) {
    if (!this.active) return
    // Instant replay: the sim is FROZEN (no fixed ticks, no physics, no
    // timers) — the ReplayManager kinematically drives bones/props/camera
    // from its ring buffer; render() keeps drawing the same scene.
    if (this.replayActive) {
      if (!Number.isFinite(dt) || dt <= 0) dt = FIXED_STEP
      try { this.replay?.updatePlayback(dt) } catch (e) {
        console.error('[combat] replay playback threw', e)
        this._abortInstantReplay()
      }
      try { this._updatePresentation(dt) } catch { /* presentation only */ }
      return
    }
    if (this.paused) return
    if (!Number.isFinite(dt) || dt <= 0) dt = FIXED_STEP
    try { this.cam.update(dt) } catch { /* stub */ }
    // Post + lighting follow the camera, so they run right after it and before
    // the fixed-step sim below (which must stay untouched by any of this).
    try { this._attachContactShadows() } catch { /* optional */ }
    try { this._updatePresentation(dt) } catch { /* presentation only */ }
    // Real elapsed time accumulates into fixed 60 Hz ticks, so hit-stop and
    // slow-mo counters measure identical wall time whether the caller runs at
    // 60, 120 or 144 Hz — a 4-frame hit-stop is ALWAYS ~67 ms of freeze.
    this._tickAcc += Math.min(dt, 0.25)
    let ticks = 0
    while (this._tickAcc >= FIXED_STEP - 1e-9 && ticks < 5) {
      this._tickAcc -= FIXED_STEP
      ticks++
      this._fixedTick()
    }
    if (ticks === 5) this._tickAcc = 0 // spiral-of-death guard (mirrors Game loop)
  }

  // One fixed 60 Hz tick. Hit-stop and slow-mo counters live HERE, on the fixed
  // clock — never on the render cadence. During hit-stop NOTHING below advances:
  // fighters, scripts, physics, particles, arena and the round timer all freeze
  // (only the camera keeps easing, updated per render above).
  _fixedTick() {
    if (this.hitStopFrames > 0) { this.hitStopFrames--; return }
    if (this.slowmoFrames > 0) {
      this.slowmoFrames--
      if (this.slowmoFrames <= 0) this.timeScale = 1
    }
    this._acc += this.timeScale
    while (this._acc >= 1) {
      this._acc -= 1
      this._worldStep(1 / 60)
    }
  }

  // ------------------------------------------------------------------ core loop

  _worldStep(dt) {
    this.worldFrame++

    // scheduled callbacks
    if (this.timers.length) {
      const due = []
      this.timers = this.timers.filter((t) => { t.n--; if (t.n <= 0) { due.push(t); return false } return true })
      for (const t of due) {
        try { t.cb() } catch (e) { console.error('[combat] timer cb threw', e) }
      }
    }

    // §20: tutorial director runs on the fixed clock; first throw disables it
    if (this.tutorial) {
      try { this.tutorial.update(dt) } catch (e) {
        console.error('[combat] tutorial threw — disabled for this match', e)
        const t = this.tutorial
        this.tutorial = null
        try { t.dispose?.() } catch { /* already broken */ }
      }
    }

    const allow = this.phase === 'fight'
    for (const f of this.fighters) f.ctrl.updateAI?.(f, f.foe, allow)
    // v2.0: the old X-only _aiItemSteer nudge is gone — the Brain routes to
    // items itself in full 2D (§17 'fetch' state via items.nearestGroundItem),
    // and the nudge would clobber its world-X intent while leaving Z intact.
    for (const f of this.fighters) f.update(dt, allow)

    // Presentation: the striking limb's trail. Fed here, one step after the
    // fighters have posed themselves and one step before particles.update()
    // builds the strip, so the ribbon head is never a frame behind the fist.
    try { this._feedSwingRibbons() } catch { /* presentation only */ }

    if (this.phase === 'fight') {
      this._scanHits()
      this._scanGrabs()
      this._pushApart()
      if (this.items) this._updateItems(dt)
    }

    // scripted specials / finishers
    if (this.fxList.length) {
      for (const fx of [...this.fxList]) fx.step()
      this.fxList = this.fxList.filter((fx) => !fx.done)
    }

    // ragdoll recovery
    for (const f of this.fighters) {
      if (f.state !== 'ragdoll') continue
      f.ragdollFrames++
      if (this.phase === 'fight' && f.hp > 0 && f.ragdollFrames > 36) {
        let settled = true
        try { settled = this.ragdolls.isSettled(f) } catch { /* stub */ }
        if (settled) this._recoverFromRagdoll(f)
      }
    }

    try { this.physics.step(dt) } catch (e) { console.error('[combat] physics.step threw', e) }
    try { this.ragdolls.update(dt) } catch (e) { console.error('[combat] ragdolls.update threw', e) }
    try { this.arena.update?.(dt) } catch (e) { console.error('[combat] arena.update threw', e) }
    this.props.update()
    this.particles.update(dt)
    this._goreSafe((g) => g.update(dt)) // decal fade / dripping, every phase
    // record this fixed frame for the instant replay (fight/finisher/ko only)
    try { this.replay?.captureFrame(this.phase) } catch { /* recorder is optional */ }

    // combo drop when the victim is back to neutral. Window is 26 (not 20):
    // un-cancelled rapid lights land ~22 frames apart (startup+active+recovery
    // on the fastest jabs), so an honest J-J-J mash that misses the rekka
    // cancel window must still read as a combo (v2.0 P1 — tutorial CHAIN step).
    for (const f of this.fighters) {
      if (f.comboHits > 0 && f.foe.isNeutral() && this.worldFrame - f.comboLastFrame > 26) {
        f.comboHits = 0
        f._comboAnnounced = false
      }
    }

    // Hazard/direct-setHp KO watchdog: arena hazards damage via f.setHp and
    // never route through _resolveHit — a fighter at 0 hp with the fight still
    // live gets a synthetic killing blow so the §23 execution flow still runs.
    if (this.phase === 'fight') {
      for (const f of this.fighters) {
        if (f.hp <= 0) {
          this._killBlow = { moveId: 'hazard', kind: 'light' }
          this.onKO(f)
          break
        }
      }
    }

    if (this.phase === 'fight') {
      this.timeLeft--
      const sec = Math.max(0, Math.ceil(this.timeLeft / 60))
      if (sec !== this._lastTimerSecond) {
        this._lastTimerSecond = sec
        this.game.events.emit('timer', { value: sec })
        // §24: announcer time warnings at 60s / 10s remaining
        if (sec === 60 && this.rules.roundTime > 60) {
          this.say('ONE MINUTE!')
          this.game.audio.sfx('klaxon')
        } else if (sec === 10 && this.rules.roundTime > 10) {
          this.say('TEN SECONDS!')
          this.game.audio.sfx('klaxon', { pitch: 1.25 })
        }
      }
      if (this.timeLeft <= 0) this._timeUp()
    }
  }

  // ------------------------------------------------------------------ flow

  startRound(n) {
    this.round = n
    this.phase = 'intro'
    this.timers = []
    // replays never straddle a round boundary (spawn resets would jump-cut)
    try { this.replay?.resetBuffer() } catch { /* recorder is optional */ }
    this._flushFx()
    this.timeScale = 1
    this.slowmoFrames = 0
    this.hitStopFrames = 0
    this.timeLeft = this.rules.roundTime * 60
    this._lastTimerSecond = -1
    this.finisherReady = [false, false]
    this._killBlow = null
    this._execFx = null
    this._execA = this._execD = null

    // §15: restore all detached parts + clear decals before fighters reset
    this._goreSafe((g) => g.onRoundReset())

    // §17: spawn points are XZ now — v1 arenas give bare x numbers (z=0),
    // v2 arenas may give {x, z}. Fighters spawn facing each other.
    const sp = this.arena.spawnPoints || [-3, 3]
    const p0 = typeof sp[0] === 'object' ? { x: sp[0]?.x ?? -3, z: sp[0]?.z ?? 0 } : { x: sp[0] ?? -3, z: 0 }
    const p1 = typeof sp[1] === 'object' ? { x: sp[1]?.x ?? 3, z: sp[1]?.z ?? 0 } : { x: sp[1] ?? 3, z: 0 }
    const yaw0 = Math.atan2(-(p1.z - p0.z), p1.x - p0.x)
    const yaw1 = Math.atan2(-(p0.z - p1.z), p0.x - p1.x)
    for (const f of this.fighters) { try { this.ragdolls.recover(f, 1) } catch { /* stub */ } }
    this.fighters[0].reset(p0.x, yaw0, p0.z)
    this.fighters[1].reset(p1.x, yaw1, p1.z)
    try { this.cam.setMode('match') } catch { /* stub */ }
    for (const f of this.fighters) {
      this.game.events.emit('health', { slot: f.slot, value: f.hp, max: f.maxHp })
      this.game.events.emit('meter', { slot: f.slot, value: Math.round(f.meter) })
    }
    this.game.events.emit('timer', { value: this.rules.roundTime })
    this.game.audio.crowd('idle')
    // #6: both fighters were just teleported back to their spawns and the
    // camera re-framed — a hard cut in everything but name.
    this._cut()

    const final = this.wins[0] === this.rules.roundsToWin - 1 || this.wins[1] === this.rules.roundsToWin - 1
    let t0 = 20
    if (n === 1) {
      t0 = 100
      for (const f of this.fighters) if (f.animator.has('entrance')) f.playClip('entrance', { restart: true })
      this.say(`${this.fighters[0].def.name} VERSUS ${this.fighters[1].def.name}!`)
    }
    const roundLine = n === 1
      ? 'ROUND ONE... FULL PORT!'
      : final ? 'FINAL ROUND... MAXIMUM LEVERAGE!' : `ROUND ${n}... DOUBLE OR NOTHING!`
    this.at(t0, () => {
      this.say(roundLine)
      this.cap(final && n > 1 ? 'FINAL ROUND' : `ROUND ${n}`)
    })
    this.at(t0 + 70, () => this.cap('READY?'))
    this.at(t0 + 115, () => this._beginFight())
  }

  _beginFight() {
    this.phase = 'fight'
    this.cap('FIGHT!')
    this.game.audio.sfx('bell')
    this.game.audio.crowd('cheer')
    if (!this.matchStartEmitted) {
      this.matchStartEmitted = true
      // p1/p2 always carry the RESOLVED charId (params may be sparse or unset;
      // defaults were merged at fighter build) — the crowd name-chants (§19)
      // resolve display names from these charIds
      this.game.events.emit('match:start', {
        mode: this.mode, arenaId: this.arenaId,
        p1: { control: 'p1', ...(this.params.p1 || {}), charId: this.fighters[0].def.id },
        p2: { control: 'ai', ...(this.params.p2 || {}), charId: this.fighters[1].def.id },
        rules: this.rules,
      })
    }
    this.game.events.emit('round:start', { round: this.round })
  }

  // §23: EVERY round-ending KO — deciding or not — flows into an automatic
  // execution cutscene. The KO beat lands first (caption, slowmo, ragdoll
  // flight), then _startExecution takes the stage, then the round ends.
  onKO(loser) {
    if (this.phase !== 'fight') return
    this.phase = 'ko'
    const winner = loser.foe
    loser.setHp(0)
    loser.clearBuffs()
    // 'fighter:ko' triggers sfx 'ko' + wild crowd via the audio module's
    // event wiring (wireAudioEvents) — don't also play them directly here.
    this.game.events.emit('fighter:ko', { slot: loser.slot })
    this._goreSafe((g) => g.onKO(loser)) // §15: KO fountain
    this.cap('K.O.!')
    this.say(BAGS.ko.next())
    this.game.audio.sfx('bell')
    this.setSlowmo(0.3, 0.55)
    if (loser.state !== 'ragdoll') {
      // §17: launch along the real winner->loser direction on the plane
      let dx = loser.pos.x - winner.pos.x
      let dz = loser.pos.z - winner.pos.z
      const dd = Math.hypot(dx, dz)
      if (dd > 1e-4) { dx /= dd; dz /= dd } else { dx = winner.dirX(); dz = winner.dirZ() }
      // NOTE: ragdolls.full scales impulse/spin by the physics preset internally
      this.forceRagdoll(loser, [dx * 11, 8.5, dz * 11 + (Math.random() - 0.5) * 2], 2.5)
    }
    // getting liquidated spills your bags
    this.particles.burst('coins', { x: loser.pos.x, y: loser.pos.y + 1.2, z: loser.pos.z }, { n: 18 })
    this.game.audio.sfx('coins_burst')
    try { this.cam.koCinematic(loser) } catch { /* stub */ }
    this._cut()   // #6: the KO camera cuts to its orbit rig — no ghost across it
    if (winner.damageTakenThisRound === 0) {
      this.at(24, () => { this.cap('FLAWLESS PORTFOLIO!'); this.say('FLAWLESS PORTFOLIO!') })
    }
    this.at(38, () => this._startExecution(winner, loser))
  }

  _timeUp() {
    if (this.phase !== 'fight') return
    this.phase = 'ko'
    this.cap('TIME UP!')
    this.say(BAGS.timeout.next())
    this.game.audio.sfx('bell')
    const [a, b] = this.fighters
    const winnerSlot = a.hp === b.hp ? (a.meter >= b.meter ? 0 : 1) : (a.hp > b.hp ? 0 : 1)
    const winner = this.fighters[winnerSlot]
    const loser = winner.foe
    this.at(40, () => {
      if (winner.state !== 'ragdoll') winner.setState('win')
      if (loser.state !== 'ragdoll') loser.setState('lose')
    })
    this.at(110, () => this._endRound(winnerSlot))
  }

  _endRound(winnerSlot) {
    if (this.phase === 'roundEnd') return
    this.phase = 'roundEnd'
    this.wins[winnerSlot]++
    this.roundsData.push({ winnerSlot, timeLeft: Math.max(0, Math.ceil(this.timeLeft / 60)) })
    this.game.events.emit('round:end', { winnerSlot })
    const winner = this.fighters[winnerSlot]
    const loser = winner.foe
    if (winner.state !== 'ragdoll' && winner.state !== 'win') winner.setState('win')
    if (loser.state !== 'ragdoll' && loser.hp > 0) loser.setState('lose')
    this.at(150, () => {
      if (this.wins[winnerSlot] >= this.rules.roundsToWin) this._endMatch(winnerSlot)
      else this.startRound(this.round + 1)
    })
  }

  _endMatch(winnerSlot) {
    this.phase = 'matchEnd'
    this._flushFx()
    const winner = this.fighters[winnerSlot]
    const result = {
      winnerSlot,
      p1: this.params.p1 || { charId: this.fighters[0].def.id, control: 'p1' },
      p2: this.params.p2 || { charId: this.fighters[1].def.id, control: 'ai' },
      arenaId: this.arenaId,
      mode: this.mode,
      rules: this.rules,
      rounds: this.roundsData,
      finisherUsed: this.finisherUsed,
      // whole-match stats for the results card — ResultsScreen probes
      // result.stats.maxCombo.p1/p2 and result.stats.damageDealt.p1/p2
      stats: {
        maxCombo: {
          p1: Math.round(this.matchStats?.maxCombo[0] || 0),
          p2: Math.round(this.matchStats?.maxCombo[1] || 0),
        },
        damageDealt: {
          p1: Math.round(this.matchStats?.damageDealt[0] || 0),
          p2: Math.round(this.matchStats?.damageDealt[1] || 0),
        },
      },
    }
    this.game.events.emit('match:end', { result })
    this.say(BAGS.win.next().replace('{W}', winner.def.name))
    this.game.audio.crowd('wild')
    this.particles.burst('confetti', { x: winner.pos.x, y: winner.pos.y + 2.2, z: winner.pos.z }, { n: 40 })
    this.at(150, () => {
      const finish = () => {
        if (this.replay?.captureAvailable()) this._preserveForReplay = true
        if (typeof this.params.onEnd === 'function') this.params.onEnd(result)
        else this.game.screens.goto('results', result)
      }
      // the KO deserves a second viewing: auto instant replay, then results
      if (this.mode !== 'training' && !this._replayPlayed && this.replay?.captureAvailable()) {
        this._replayPlayed = true
        this._startInstantReplay(finish)
      } else finish()
    })
  }

  // ---------------------------------------------------------------- replay

  // Auto KO replay: last ~5 s at 0.4x, replay-orbit camera, big DOM stamps,
  // skippable by any input. The sim freezes (update() short-circuits), the
  // buffer drives everything, then live state restores exactly and `done`
  // continues the normal results flow.
  _startInstantReplay(done) {
    const rp = this.replay
    this.replayActive = true
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      this._replayFinish = null
      if (rp) rp.onStamp = null
      this._replayUI?.hide()
      this._replayUI = null
      this.replayActive = false
      this._cut()   // #6: replay orbit -> live camera is a cut, both ways
      done()
    }
    this._replayFinish = finish
    let ok = false
    try { ok = rp.playInstantReplay({ seconds: 5, slowmo: 0.4, onDone: finish }) } catch (e) {
      console.error('[combat] instant replay failed to start', e)
    }
    this._cut()   // #6: live camera -> replay orbit rig
    if (!ok) { finish(); return }
    this._replayUI = showInstantReplay(this.game, {
      onSkip: () => { try { rp.skipInstant() } catch { finish() } },
    })
    rp.onStamp = (st) => this._replayUI?.stamp(st)
  }

  // navigate=false is the exit() path: the screen is already being torn down,
  // so restore + clean the overlay but do NOT trigger the results transition.
  _abortInstantReplay(navigate = true) {
    try { this.replay?.exitPlayback() } catch { /* forced */ }
    const finish = this._replayFinish
    if (navigate && finish) { finish(); return }
    this._replayFinish = null
    if (this.replay) this.replay.onStamp = null
    this._replayUI?.hide()
    this._replayUI = null
    this.replayActive = false
    this._cut()   // #6: forced exit from the replay camera is still a cut
  }

  _togglePause() {
    // pause key spam during the instant replay just skips it — the sim is
    // already frozen, so a real pause underneath would deadlock the flow
    if (this.replayActive) { try { this.replay?.skipInstant() } catch { /* forced */ } return }
    if (!this.active || this.phase === 'matchEnd') return
    this.paused = !this.paused
    this.game.events.emit(this.paused ? 'match:paused' : 'match:resumed')
  }

  // ------------------------------------------------- the contact-frame pose

  /**
   * FEEL-CRITIC #1, PART 1: "hold the attacker at FULL EXTENSION for the
   * hit-stop duration instead of whatever pose the clip happens to be in — the
   * extension frame must be the frozen one."
   *
   * The mechanism, and why it belongs here rather than in the animator: during
   * hit-stop _fixedTick() returns before anything updates, so the attacker's
   * bones keep EXACTLY the pose they had on the frame the hit resolved. That
   * frame is the first ACTIVE frame — the fist has only just entered the
   * hitbox and the clip is nowhere near its widest pose. The freeze is not the
   * bug (Animator.attackDrive has the same note about the torque spring); the
   * bug is which pose gets frozen. So on the contact frame, before the freeze
   * starts, we scrub the attack clip forward to the pose with the widest
   * silhouette anywhere in its remaining active window and re-pose once.
   *
   * WHAT THIS DOES NOT TOUCH: moveFrame, hitStop frame counts, damage,
   * hitboxes, knockback, any timing. `animator.time` is a render-side clip
   * cursor with no gameplay meaning. The scrub is bounded by the END OF THE
   * ACTIVE WINDOW plus a small overshoot, so the clip can never run more than
   * a couple of frames ahead of the move, and it is NOT restored afterwards on
   * purpose: snapping back would make the arm re-extend during recovery.
   *
   * Best-effort throughout — a stub rig, a clipless move or a missing camera
   * all fall through to the old behaviour.
   *
   * ROUND 13 — IT WAS OPTIMISING THE WRONG THING. The probe used to score
   * SCREEN-SPACE SILHOUETTE WIDTH, and the feel critic's read of the result was
   * exact: "in h4-impact that picks a bent-over torso with the trailing arm
   * flung AWAY from the victim; there is no limb anywhere near the flash. The
   * frame is wide, but it does not read as a strike — I cannot tell who hit
   * whom." A silhouette is wide when the limbs are spread ACROSS the frame,
   * which on a punch thrown roughly down the camera axis is maximised by the
   * arm that is NOT throwing it. Worse, the measurement said the probe was
   * doing nothing at all: the frozen pose beat the pose that would have been
   * frozen by a median factor of 1.002.
   *
   * The right objective was already one function down. `_strikeTip` scores
   * `(x-hx)*fx + (z-hz)*fz` — reach along facing — to decide WHICH limb is
   * striking. Reach is also what "full extension" means. So the probe now
   * scores the strike tip's REACH ALONG THE ATTACKER->VICTIM AXIS, measured
   * from the attacker's root, and keeps silhouette width only as a tie-break
   * between poses whose reach is within EXT_REACH_EPS.
   *
   * Bounded by the contact point, not unbounded. Maximising raw reach would
   * happily pick the follow-through two frames past the victim; `pt` (the
   * hitbox contact point the caller already computed) is projected onto the
   * same axis and any probe that reaches more than EXT_OVERSHOOT past it is
   * penalised. So the search reads: "the fullest extension that still lands on
   * the man" — which is the acceptance test, and which also puts the tip inside
   * the impact flash, because the flash is spawned at `pt`.
   *
   * `pt` and `victim` are optional. Without them the axis degrades to the
   * attacker's facing and the bound is dropped, which is still reach rather
   * than width.
   */
  _holdExtension(a, move, pt = null, victim = null) {
    const an = a && a.animator
    const clip = an && an.clip
    if (!clip || !move || typeof an.update !== 'function') return
    // Only ever scrub the MOVE's own clip. A move with no clip (or one the
    // character does not ship) falls back to looping 'idle' inside
    // Fighter.startMove, and scrubbing a loop just teleports the idle cycle.
    if (clip.loop) return
    if (move.clip && an.clipName !== move.clip) return
    const dur = clip.duration || 0
    if (!(dur > 1e-4)) return
    const total = Math.max(1, (move.startup || 0) + (move.active || 0) + (move.recovery || 0))
    const t0 = Number.isFinite(an.time) ? an.time : 0
    // End of the active window in clip time, plus a 16% overshoot: on a clip
    // whose peak reach sits just past the last active frame that overshoot is
    // the difference between finding the extension and stopping short of it.
    // The 0.94 ceiling keeps the scrub out of the clip's final settle pose.
    const tEnd = Math.min(dur * 0.94,
      dur * ((move.startup || 0) + (move.active || 0)) / total + dur * 0.16)
    if (!(tEnd > t0 + 1e-4)) return

    // A crossfade still running at contact would blend the extension back
    // toward the previous clip's pose. Past the halfway mark the fade has
    // nothing left to say, so retire it and let the extension land clean.
    if (an.fading && an.fadeDur > 0 && an.fadeTime >= an.fadeDur * 0.5) {
      an.fading = false
      an.fadeTime = an.fadeDur
    }

    // Silhouette width is now only the TIE-BREAK, but it is still scored in
    // SCREEN space: the width acceptance ("40%+ wider than idle") is measured
    // there, and world-axis width would rank a punch thrown toward the lens as
    // narrow when on screen it is the widest thing the clip does.
    this._extViewProj()

    // --- the objective axis: attacker -> victim, planar, unit ---------------
    // Origin is the attacker's ROOT, not the hips bone: the hips animate across
    // the probes and an origin that moves with the pose is not an origin. The
    // root is frozen for the whole search (root motion is snapshotted below).
    const ox = a.pos ? a.pos.x : 0
    const oz = a.pos ? a.pos.z : 0
    let ux = 0, uz = 0
    const tgt = victim && victim.pos ? victim.pos : pt
    if (tgt) { ux = tgt.x - ox; uz = tgt.z - oz }
    const ulen = Math.hypot(ux, uz)
    if (ulen > 1e-4) { ux /= ulen; uz /= ulen } else {
      ux = a.dirX ? a.dirX() : (a.facingSign || 1)
      uz = a.dirZ ? a.dirZ() : 0
      const fl = Math.hypot(ux, uz) || 1
      ux /= fl; uz /= fl
    }
    // Where the hit actually happened, on that axis. No `pt` -> no bound, and
    // the search degrades to "reach as far as the clip goes".
    const targetReach = pt ? (pt.x - ox) * ux + (pt.z - oz) * uz : Infinity
    const bounded = Number.isFinite(targetReach)

    // Probe with secondary motion off: springs integrate nothing at dt 0 but
    // they do rewrite their parent-rotation history every call, and there is
    // no reason to churn it seven times for a measurement.
    const secondary = an.secondaryOn
    an.secondaryOn = false
    // ---- ROOT MOTION MUST NOT LEAK -------------------------------------
    // A clip flagged `root: true` accumulates hips XZ deltas into the
    // animator's root-motion channel on every update(), and Fighter drains
    // that channel straight into fighter.pos. Scrubbing the clip forward would
    // therefore TELEPORT the attacker by the distance the clip's hips travel
    // between the contact frame and the extension frame — seven times over,
    // once per probe. This is presentation; it may not move anybody. The
    // channel is snapshotted and restored, and _rootPrev is deliberately left
    // where the final pose put it so the next real frame measures a normal
    // one-frame delta from there instead of a jump.
    const rm = an._rootMotion
    const rmx = rm ? rm.x : 0, rmy = rm ? rm.y : 0, rmz = rm ? rm.z : 0
    let bestT = t0
    // Lexicographic: tier first (1 = the tip lands within EXT_OVERSHOOT of the
    // contact point, 0 = it does not), then score, then silhouette width.
    // In tier 1 the score is REACH — the fullest extension that still lands on
    // the man. In tier 0 (nothing in band at all) it is -|error|, i.e. the
    // closest miss, so the hold still points at the victim.
    let bestTier = -1
    let bestScore = -Infinity
    let bestW = -1
    let bestReach = NaN
    let baseW = -1
    let baseReach = NaN
    // The pose the OLD objective (max silhouette width) would have frozen, kept
    // so the verifier can measure the gain of the swap directly rather than
    // inferring it.
    let widthW = -1
    let widthReach = NaN
    let widthT = t0
    try {
      for (let i = 0; i < EXT_PROBES.length; i++) {
        const t = t0 + (tEnd - t0) * EXT_PROBES[i]
        an.time = t
        an.update(0)
        // update() rewrites bone LOCALS; the world matrices the measurement
        // reads are stale until the subtree is refreshed.
        a.root?.updateMatrixWorld?.(true)
        const w = this._silhouetteWidth(a)
        // Reach of the striking limb along the attacker->victim axis. Limb
        // SELECTION uses the same axis, so a cross-up does not keep scoring the
        // arm that is furthest along a stale facing sign.
        const tip = this._strikeTip(a, ux, uz)
        const reach = tip ? (tip.x - ox) * ux + (tip.z - oz) * uz : -Infinity
        const err = bounded ? Math.abs(reach - targetReach) : 0
        const tier = (!bounded || err <= EXT_OVERSHOOT) ? 1 : 0
        const score = tier === 1 ? reach : -err
        if (i === 0) { baseW = w; baseReach = reach }   // probe 0 = no scrub at all
        if (w > widthW) { widthW = w; widthReach = reach; widthT = t }
        // Width is the tie-break ONLY, inside EXT_REACH_EPS of the leader, and
        // it can never promote a probe out of a lower tier.
        const better = Number.isFinite(score) && (
          tier > bestTier ||
          (tier === bestTier && (score > bestScore + EXT_REACH_EPS ||
            (score > bestScore - EXT_REACH_EPS && w > bestW))))
        if (better) {
          bestScore = tier === bestTier ? Math.max(bestScore, score) : score
          bestTier = tier; bestW = w; bestT = t; bestReach = reach
        }
      }
    } catch {
      an.secondaryOn = secondary
      an.time = t0
      try { an.update(0) } catch { /* stub rig */ }
      if (rm) { rm.x = rmx; rm.y = rmy; rm.z = rmz }
      return
    }
    // No probe produced a usable strike tip at all (a stub rig, or a character
    // with none of STRIKE_LIMBS). Reach cannot rank anything, so fall back to
    // the old width objective rather than holding the contact pose.
    if (bestTier < 0) { bestT = widthT; bestW = widthW; bestReach = NaN }
    an.secondaryOn = secondary
    an.time = bestT
    try {
      an.update(0)
      a.root?.updateMatrixWorld?.(true)
    } catch { /* stub rig */ }
    if (rm) { rm.x = rmx; rm.y = rmy; rm.z = rmz }
    // The ribbon was fed earlier in this step, from the PRE-extension pose, so
    // its head would stop short of the fist the freeze is about to hold. One
    // more sample lands the blade on the extended limb.
    if (a._ribbonMove) {
      const tip = this._strikeTip(a, ux, uz)
      if (tip) {
        try { this.particles?.swing?.(a.slot, tip.x, tip.y, tip.z) } catch { /* pool optional */ }
      }
    }
    // Diagnostics for the verifier. Nothing in the sim reads any of these.
    //   _extHoldReach   reach of the pose actually held
    //   _extWidthReach  reach of the pose the OLD width objective would have
    //                   frozen — `_extHoldReach / _extWidthReach` IS the gain
    //                   of the swap, and it was measuring 1.002 before it
    //   _extBaseReach   reach at probe 0, i.e. no scrub at all
    //   _extProjErr     |held tip - contact point| along the objective axis;
    //                   the acceptance is < 0.15 m
    // Measured on the pose that is actually being held, AFTER secondary motion
    // was switched back on and the final update ran — not on the probe's
    // reading, which was taken with the springs off.
    const heldTip = this._strikeTip(a, ux, uz)
    const heldReach = heldTip ? (heldTip.x - ox) * ux + (heldTip.z - oz) * uz : NaN
    a._extHoldT = bestT
    a._extHoldWidth = bestW
    a._extBaseWidth = baseW
    a._extWidthWidth = widthW
    a._extHoldReach = Number.isFinite(heldReach) ? heldReach : bestReach
    a._extWidthReach = widthReach
    a._extBaseReach = baseReach
    a._extTargetReach = targetReach
    a._extProjErr = (Number.isFinite(heldReach) && bounded)
      ? Math.abs(heldReach - targetReach) : NaN
    a._extInBand = bestTier === 1
    a._extAxis = { x: ux, z: uz }
    a._extContact = pt ? { x: pt.x, y: pt.y, z: pt.z } : null
    a._extTip = heldTip ? { x: heldTip.x, y: heldTip.y, z: heldTip.z } : null
  }

  /** Cache projection * viewInverse for _silhouetteWidth. Called once per
   *  _holdExtension so the seven probes share one matrix multiply. */
  _extViewProj() {
    const cam = this.camera
    const M = this._extVP || (this._extVP = new THREE.Matrix4())
    if (!cam) { M.identity(); return M }
    cam.updateMatrixWorld()
    M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    return M
  }

  /** Horizontal spread of the skeleton in NORMALISED DEVICE COORDINATES, i.e.
   *  the same axis and the same perspective the screenshot rig measures. Bone
   *  origins only — 20-60 reads, no allocation. Bones behind the near plane are
   *  skipped rather than mirrored to the wrong side of the frame. */
  _silhouetteWidth(f) {
    const list = f.animator && f.animator.list
    if (!list || !list.length) return 0
    const e = (this._extVP || this._extViewProj()).elements
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      const m = b && b.matrixWorld && b.matrixWorld.elements
      if (!m) continue
      const x = m[12], y = m[13], z = m[14]
      const w = e[3] * x + e[7] * y + e[11] * z + e[15]
      if (!(w > 1e-4)) continue
      const p = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w
      if (p < lo) lo = p
      if (p > hi) hi = p
    }
    return hi > lo ? hi - lo : 0
  }

  // ------------------------------------------------------- swing ribbons (fx)

  // Feel-critic #1, part 3: "add a swing ribbon on the striking limb across
  // the 3-4 startup frames so the approach is visible at all."
  //
  // Runs once per fixed step, after the fighters have posed themselves and
  // before the pool's own update() builds the strip, so the ribbon head is on
  // the same frame as the limb. Purely additive presentation: it reads bone
  // world positions and writes nothing back.
  _feedSwingRibbons() {
    const P = this.particles
    if (!P || typeof P.swing !== 'function') return
    for (const f of this.fighters) {
      const m = f.currentMove
      const live = f.state === 'attack' && m && m.kind !== 'grab' && !f.scriptFx &&
        f.moveFrame >= (m.startup || 0) - RIBBON_LEAD &&
        f.moveFrame <= (m.startup || 0) + (m.active || 0) + 1
      if (!live) { P.endSwing(f.slot); f._ribbonMove = null; continue }
      const tip = this._strikeTip(f)
      if (!tip) { P.endSwing(f.slot); f._ribbonMove = null; continue }
      const restart = f._ribbonMove !== m
      f._ribbonMove = m
      // Heavier moves get a wider, hotter blade. Kicks read cooler than fists
      // only because the limb is longer, so the width scales off the move kind
      // rather than the bone.
      const heavy = m.kind === 'heavy' || m.kind === 'launcher' || m.kind === 'special' || m.kind === 'super'
      P.swing(f.slot, tip.x, tip.y, tip.z, {
        width: heavy ? 0.30 : 0.19,
        gain: heavy ? 0.85 : 0.58,
        color: m.kind === 'super' ? 0xfff0c4 : 0xffe9c0,
        restart,
      })
    }
  }

  // World position of the striking limb's TIP, or null.
  //
  // The roster has no hand or foot bones (hips/torso/head/armL·R/forearmL·R/
  // legL·R/shinL·R plus per-character extras), so the tip is extrapolated: the
  // forearm bone is the elbow, and the fist sits about one more upper-arm
  // length down the same line. Whichever candidate ends up furthest along the
  // attacker's own facing direction is the one doing the striking, which picks
  // the right limb for punches, kicks and mirrored rigs without any per-move
  // or per-character authoring.
  //
  // `axX`/`axZ` optionally override that direction with a caller-supplied
  // planar unit axis — the extension hold passes attacker->victim, so on a
  // cross-up the limb reaching toward the man who is actually being hit wins
  // instead of the limb furthest along a facing sign that has not flipped yet.
  // Omitted, behaviour is exactly as before.
  _strikeTip(f, axX, axZ) {
    const B = f.bones
    if (!B) return null
    const root = f.root
    if (root && root.updateMatrixWorld) {
      try { root.updateMatrixWorld(true) } catch { return null }
    }
    const hips = B.hips
    if (!hips || !hips.matrixWorld) return null
    const hm = hips.matrixWorld.elements
    const hx = hm[12], hy = hm[13], hz = hm[14]
    const useAxis = Number.isFinite(axX) && Number.isFinite(axZ) && Math.hypot(axX, axZ) > 1e-4
    const fx = useAxis ? axX : (f.dirX ? f.dirX() : (f.facingSign || 1))
    const fz = useAxis ? axZ : (f.dirZ ? f.dirZ() : 0)
    let best = null
    let bestReach = -Infinity
    for (const pair of STRIKE_LIMBS) {
      const tipBone = B[pair[0]]
      const rootBone = B[pair[1]]
      if (!tipBone || !tipBone.matrixWorld) continue
      const tm = tipBone.matrixWorld.elements
      let x = tm[12], y = tm[13], z = tm[14]
      if (rootBone && rootBone.matrixWorld) {
        const rm = rootBone.matrixWorld.elements
        // Extend past the elbow/knee by `pair[2]` of the parent segment.
        x += (x - rm[12]) * pair[2]
        y += (y - rm[13]) * pair[2]
        z += (z - rm[14]) * pair[2]
      }
      if (!Number.isFinite(x + y + z)) continue
      const reach = (x - hx) * fx + (z - hz) * fz + Math.abs(y - hy) * 0.25
      if (reach > bestReach) { bestReach = reach; best = _tipV.set(x, y, z) }
    }
    return best
  }

  // ------------------------------------------------------------------ hits

  // Attacker-attributed stat tracking for the results card — whole match, all
  // rounds. Call AFTER comboHits has been bumped for the hit (where it bumps).
  // Hazards never route through here: they have no attacker and stay uncounted.
  _trackHit(attacker, dmg) {
    const st = this.matchStats
    if (!st || !attacker) return
    st.damageDealt[attacker.slot] += Math.max(0, dmg || 0)
    if (attacker.comboHits > st.maxCombo[attacker.slot]) st.maxCombo[attacker.slot] = attacker.comboHits
  }

  // §17: distance + attacker-facing cone (~70°) + height overlap replaces the
  // v1 X-AABB test. Point-blank hits (< 0.6m) skip the cone so back-to-back
  // scrambles still trade like they used to.
  _scanHits() {
    for (const a of this.fighters) {
      const m = a.activeAttack()
      if (!m) continue
      const d = a.foe
      // OTG: past the 90-frame mark a downed foe is a legal target even though
      // isInvulnerable() still lists knockdown/ragdoll (pre-mark behavior is
      // exactly the old invulnerability).
      let otg = null
      if (d.isInvulnerable()) {
        otg = this._otgTarget(d)
        if (!otg) continue
      }
      const hb = m.hitbox || { w: 1, h: 0.8, d: 1, forward: 1, up: 1.2 }
      // during ragdoll d.pos is stale (the launch spot) — aim at the prone body
      let dx = (otg ? otg.x : d.pos.x) - a.pos.x
      let dz = (otg ? otg.z : d.pos.z) - a.pos.z
      const dist = Math.hypot(dx, dz)
      const reach = (hb.forward ?? 1) + (hb.w ?? 1) * 0.5 +
        d.radius() * (otg ? OTG_PRONE_RADIUS_MULT : 1)
      if (dist > reach) continue
      let nx, nz
      if (dist > 1e-4) { nx = dx / dist; nz = dz / dist } else { nx = a.dirX(); nz = a.dirZ() }
      if (dist > 0.6 && (nx * a.dirX() + nz * a.dirZ()) < COS_HALF_CONE) continue
      // vertical band of the attack vs the victim's height span (prone = low)
      const up = hb.up ?? 1.2
      const hh = (hb.h ?? 0.8) / 2
      const ay0 = a.pos.y + up - hh
      const ay1 = a.pos.y + up + hh
      const span = otg
        ? { y0: 0, y1: Math.max(OTG_PRONE_HEIGHT, (d.def.height || 1.8) * 0.35) }
        : d.heightSpan()
      if (ay0 >= span.y1 || ay1 <= span.y0) continue
      a.hitDone = true
      a.contactMade = true
      const pr = Math.min(dist, hb.forward ?? 1)
      const pt = {
        x: a.pos.x + nx * pr,
        y: Math.max(span.y0, Math.min(span.y1, (ay0 + ay1) / 2)),
        z: a.pos.z + nz * pr,
      }
      if (otg) this._resolveOtgHit(a, d, m, pt, { x: nx, z: nz })
      else this._resolveHit(a, d, m, pt, { x: nx, z: nz })
    }
  }

  // OTG target check: returns the prone body's XZ when the downed fighter is
  // legally hittable, else null. Ragdolls qualify once the pile is genuinely
  // DOWN — settled, or lying low (a body sliding along the floor reads as
  // "on the ground" to the player; a mid-air tumble does not).
  _otgTarget(d) {
    if (d.otgHit || d.hp <= 0 || (d.fallFrames || 0) < OTG_FRAMES) return null
    if (d.state === 'knockdown') return { x: d.pos.x, z: d.pos.z }
    if (d.state !== 'ragdoll') return null
    let hx = d.pos.x
    let hz = d.pos.z
    let hy = 0
    try {
      d.bones.hips.getWorldPosition(_otgV)
      if (Number.isFinite(_otgV.x + _otgV.y + _otgV.z)) { hx = _otgV.x; hy = _otgV.y; hz = _otgV.z }
    } catch { /* stub rig */ }
    let settled = true
    try { settled = this.ragdolls.isSettled(d) } catch { /* stub */ }
    if (!settled && hy > OTG_PRONE_HEIGHT) return null
    return { x: hx, z: hz }
  }

  // OTG hit resolution: normal damage (damageScale via setHp, gore blood, HUD
  // events with otg:true), no blocking/armor (a downed body does neither), and
  // the one-per-fall forced getup with its anti-loop invulnerability window.
  _resolveOtgHit(a, d, move, pt, dir) {
    d.otgHit = true // latch FIRST — nothing below may re-enter
    const kickDir = Math.sign(dir.x) || a.facingSign
    const scale = Math.max(0.3, Math.pow(0.9, a.comboHits))
    const dmg = Math.max(1, Math.round((move.damage || 5) * scale * a.damageMult))
    a.comboHits++
    a.comboLastFrame = this.worldFrame
    this._goreHit(d, a, dmg, pt, kickDir)
    d.setHp(d.hp - dmg)
    d.damageTakenThisRound += dmg
    this._trackHit(a, dmg)
    a.gainMeter(move.meterGain || 5)
    d.gainMeter(dmg * 0.35)
    this.game.events.emit('fighter:hit', { slot: d.slot, damage: dmg, move: move.id, counter: false, combo: a.comboHits, dirX: kickDir, otg: true })
    if (a.comboHits >= 2) this.game.events.emit('combo', { slot: a.slot, hits: a.comboHits })
    this.hitStop(move.hitStop || 3)
    // OTG only: `d.pos` is the launch spot, not the prone body, so the victim
    // is NOT handed over — `pt` (built from the real prone XZ in _scanHits) is
    // the only trustworthy point here.
    this._holdExtension(a, move, pt, null)
    try { this.cam.kick(kickDir, Math.min(1, 0.06 + dmg * 0.04)) } catch { /* stub */ }
    this.game.audio.sfx(move.sfx || KIND_SFX[move.kind] || 'punch_light')
    this.particles.burst('impact', pt, { dirX: kickDir })
    if (d.hp <= 0) {
      this._killBlow = { moveId: move.id, kind: move.kind } // §23
      this.onKO(d)
      return
    }
    // first OTG hit of the fall pops them straight up, briefly untouchable
    if (d.state === 'ragdoll') {
      const instant = this._settleRagdoll(d)
      d.enterGetup(OTG_GETUP_INVULN, instant)
    } else {
      d.enterGetup(OTG_GETUP_INVULN)
    }
  }

  // dir = planar unit vector attacker -> victim (falls back to attacker facing).
  // All knockback/pushback resolves along it; payload shapes stay v1 (dirX is
  // still the ±1 world-X hint the HUD/gore/camera already consume).
  _resolveHit(a, d, move, pt, dir) {
    if (!dir) dir = { x: a.dirX(), z: a.dirZ() }
    const kickDir = Math.sign(dir.x) || a.facingSign // attacker -> victim, world-X sign

    // ---- blocked ----
    if (d.isBlockingAgainst(a) && move.kind !== 'grab') {
      const special = move.kind === 'special' || move.kind === 'super'
      if (special) {
        const chip = Math.max(1, Math.round((move.damage || 5) * 0.15 * a.damageMult))
        this._goreHit(d, a, chip, pt, kickDir)
        d.setHp(Math.max(1, d.hp - chip)) // chip never kills
        d.damageTakenThisRound += chip
        this._trackHit(a, chip)
      }
      const bk = (move.knockback?.x || 4) * 0.55 * a.knockbackMult
      d.enterBlockstun(move.blockStun || 8, dir.x * bk, dir.z * bk)
      if (this._nearWall(d)) { a.vel.x = -dir.x * 2.5; a.vel.z = -dir.z * 2.5 } // pushback reflects off the wall
      a.gainMeter((move.meterGain || 5) * 0.5)
      d.gainMeter(2)
      this.hitStop(Math.min(3, move.hitStop || 2))
      this.game.events.emit('fighter:blocked', { slot: d.slot, move: move.id, attacker: a.slot })
      this.game.audio.sfx('block')
      this.particles.burst('sparks', pt, { n: 6, dirX: kickDir })
      return
    }

    const counter = d.state === 'attack' && d.currentMove && d.moveFrame < (d.currentMove.startup || 0)

    // ---- armor ----
    if (d.armorFrames > 0) {
      const dmg = Math.max(1, Math.round((move.damage || 5) * 0.5 * a.damageMult))
      this._goreHit(d, a, dmg, pt, kickDir)
      d.setHp(d.hp - dmg)
      d.damageTakenThisRound += dmg
      this._trackHit(a, dmg)
      d.flash(0xffaa22, 3) // amber = armor absorbed it (victim impact flash is white)
      d.squash(0.1)
      a.gainMeter((move.meterGain || 5) * 0.5)
      this.hitStop(2)
      this._holdExtension(a, move, pt, d)
      this.game.audio.sfx('thud', { pitch: 0.7 })
      this.particles.burst('impact', pt, { n: 4 })
      this.game.events.emit('fighter:hit', { slot: d.slot, damage: dmg, move: move.id, counter: false, combo: 0, dirX: kickDir })
      if (d.hp <= 0) {
        this._killBlow = { moveId: move.id, kind: move.kind } // §23
        this.onKO(d)
      }
      return
    }

    // ---- clean / counter hit ----
    const scale = Math.max(0.3, Math.pow(0.9, a.comboHits))
    const dmg = Math.max(1, Math.round((move.damage || 5) * scale * (counter ? 1.5 : 1) * a.damageMult))
    a.comboHits++
    a.comboLastFrame = this.worldFrame
    this._goreHit(d, a, dmg, pt, kickDir)
    d.setHp(d.hp - dmg)
    d.damageTakenThisRound += dmg
    this._trackHit(a, dmg)
    a.gainMeter(move.meterGain || 5)
    d.gainMeter(dmg * 0.35)

    this.game.events.emit('fighter:hit', { slot: d.slot, damage: dmg, move: move.id, counter, combo: a.comboHits, dirX: kickDir })
    if (a.comboHits >= 2) this.game.events.emit('combo', { slot: a.slot, hits: a.comboHits })
    if (a.comboHits === 5 && !a._comboAnnounced) { a._comboAnnounced = true; this.say(BAGS.combo5.next(), 120) }
    if (counter) { this.say(BAGS.counter.next(), 90); this.cap('COUNTER!') }
    if (!this.firstHitDone) { this.firstHitDone = true; this.say(BAGS.firstHit.next(), 300) }

    this.hitStop((move.hitStop || 3) + (counter ? 2 : 0))
    // The freeze starts on the NEXT tick, so this is the last chance to decide
    // which pose it holds. See _holdExtension().
    this._holdExtension(a, move, pt, d)
    // directional camera kick along the real hit axis (attacker -> victim, so
    // cross-ups shove the right way), magnitude scaled by damage. cam.kick is
    // idempotent per frame — this call carries better data than the camera's
    // own 'fighter:hit' fallback and wins by magnitude.
    try { this.cam.kick(kickDir, Math.min(1, 0.06 + dmg * 0.04)) } catch { /* stub */ }
    if (dmg >= 9) this.game.events.emit('camera:shake', { mag: 0.22 + dmg * 0.016 })
    // §8: post-stack punch on heavy hits only — bloom kick + chromatic spike +
    // exposure lift, decaying over ~6 frames. Deliberately gated at the same
    // damage threshold as the camera shake so light pokes stay clean; jabs
    // landing 60 times a round with a screen-wide flash would be unreadable.
    if (dmg >= 9) this._impactFx(Math.min(1, 0.35 + dmg * 0.035))
    this.game.audio.sfx(move.sfx || KIND_SFX[move.kind] || 'punch_light')
    this.particles.burst('impact', pt, { dirX: kickDir })
    if (dmg >= 11) this.particles.burst('sparks', pt, { dirX: kickDir })
    if (a.comboHits >= 3 || dmg >= 14) this.game.audio.crowd('cheer')

    // ---- reaction ----
    const kb = move.knockback || {}
    const weight = Math.max(0.5, d.def.weight || 1)
    // kinematic knockback: preset-scaled AND weight-resisted (the kinematic body has no mass)
    const kbMult = this.presetCfg.knockback / (0.5 + weight * 0.5)
    const kx = (kb.x ?? 4) * kbMult * a.knockbackMult // horizontal magnitude along dir
    const ky = (kb.y ?? 0) * Math.sqrt(this.presetCfg.knockback) * a.knockbackMult
    const spin = (kb.spin ?? 0.5) * this.presetCfg.spin
    const rag = move.ragdollThreshold || 0

    // ragdoll launch impulses: ragdolls.full applies the physics preset itself and
    // the ragdoll body masses already scale with def.weight — pass RAW values so
    // neither preset nor weight is applied twice (heavies feel heavy exactly once).
    const rk = (kb.x ?? 4) * a.knockbackMult
    const rky = (kb.y ?? 0) * a.knockbackMult
    const rspin = kb.spin ?? 0.5

    if (d.hp <= 0) {
      this._killBlow = { moveId: move.id, kind: move.kind } // §23: capture at the source
      this.forceRagdoll(d, [dir.x * rk * 1.5, Math.max(rky, 6.5), dir.z * rk * 1.5 + (Math.random() - 0.5) * 1.5], rspin + 1)
      this.onKO(d)
      return
    }
    if (rag >= 2) {
      this.forceRagdoll(d, [dir.x * rk * 1.2, Math.max(rky, 3.5), dir.z * rk * 1.2], rspin)
      return
    }
    const airborne = !d.grounded() || d.state === 'launched'
    if (move.launcher || ky > 3 || airborne) {
      // partial() is cosmetic flinch — raw impulses, no preset/weight scaling
      if (rag === 1) { try { this.ragdolls.partial(d, 'upper', [dir.x * rk * 0.5, rky * 0.5, dir.z * rk * 0.5]) } catch { /* stub */ } }
      this.launchFighter(d, dir.x * kx, Math.max(ky, airborne ? 4.5 : 2), spin, dir.z * kx)
      if (move.launcher) this.game.audio.sfx('launch')
    } else {
      const stun = (move.hitStun || 14) + (counter ? 6 : 0)
      this.stunFighter(d, stun, dmg >= 10, dir.x * kx * 0.8, dir.z * kx * 0.8)
      if (rag === 1) { try { this.ragdolls.partial(d, dmg >= 10 ? 'upper' : 'head', [dir.x * rk * 0.4, 1.5, dir.z * rk * 0.4]) } catch { /* stub */ } }
      // pushback: attacker slides back a touch if the victim is cornered
      if (this._nearWall(d)) { a.vel.x -= dir.x * 1.8; a.vel.z -= dir.z * 1.8 }
    }
    // ---- THE VICTIM FLASH, RE-ARMED ON HEAVIES ONLY --------------------
    // The heavy-hit white flash was pulled back until it covered 0.49% of the
    // victim's bbox above luma 245 — safe, but the verifier's own note was
    // that the contact may now barely read. The middle is DURATION, not
    // amplitude: Fighter.flash() caps peak radiance at FLASH_PEAK regardless
    // of what we ask for (that cap is what protects the silhouette and it is
    // deliberately left alone), but the visible window is a request, clamped
    // to FLASH_MS_MAX ~= 3 rendered frames. enterHitstun/enterLaunched already
    // fired the default 2-frame flash; re-arming it at 4 frames on a heavy
    // stretches the SAME peak across the whole hit-stop instead of retiring it
    // a frame in. Light pokes are untouched, so jabs stay clean.
    if (dmg >= 9 && d.state !== 'ragdoll' && d.hp > 0) {
      try { d.flash(0xffffff, 4) } catch { /* stub rig */ }
    }
  }

  _nearWall(f) {
    const b = this.bounds
    return f.pos.x <= b.minX + 0.6 || f.pos.x >= b.maxX - 0.6 ||
      f.pos.z <= (b.minZ ?? DEFAULT_MIN_Z) + 0.6 || f.pos.z >= (b.maxZ ?? DEFAULT_MAX_Z) - 0.6
  }

  _scanGrabs() {
    for (const a of this.fighters) {
      if (!a.grabActive()) continue
      const d = a.foe
      const move = a.currentMove
      // throws beat block; they lose to airborne/downed/stunned targets
      if (d.state === 'knockdown' || d.state === 'getup' || d.state === 'ragdoll' ||
        d.state === 'grabbed' || d.state === 'launched' || d.state === 'hitstun' ||
        d.state === 'ko' || d.state === 'finisher' || !d.grounded() || d.invuln > 0) continue
      const range = (move.hitbox?.forward ?? 0.8) + 0.6
      const gdx = d.pos.x - a.pos.x
      const gdz = d.pos.z - a.pos.z
      const gdist = Math.hypot(gdx, gdz)
      if (gdist > range) continue
      // generous grab cone (~145°) — throws stay a close-range answer, not a vacuum
      if (gdist > 0.3 && (gdx * a.dirX() + gdz * a.dirZ()) / gdist < 0.3) continue
      a.hitDone = true
      a.contactMade = true
      d.currentMove = null
      d.scriptFx?.end()
      d.state = 'grabbed'
      d.stateFrames = 0
      d.vel.set(0, 0, 0)
      d.animator.play('hitHeavy', { restart: true })
      a.throwSeq = { t: 0, foe: d, move }
      a.vel.x = 0
      this.game.audio.sfx('grab')
      this.hitStop(3)
    }
  }

  finishThrow(a, d, move) {
    const fdx = a.dirX(), fdz = a.dirZ() // throws launch along the thrower's facing
    const kickDir = Math.sign(fdx) || a.facingSign
    const scale = Math.max(0.3, Math.pow(0.9, a.comboHits))
    const dmg = Math.max(1, Math.round((move.damage || 10) * scale * a.damageMult))
    a.comboHits++
    a.comboLastFrame = this.worldFrame
    this._goreHit(d, a, dmg, { x: d.pos.x, y: d.pos.y + 1, z: d.pos.z }, kickDir)
    d.setHp(d.hp - dmg)
    d.damageTakenThisRound += dmg
    this._trackHit(a, dmg)
    a.gainMeter(move.meterGain || 8)
    d.gainMeter(dmg * 0.35)
    this.game.events.emit('fighter:hit', { slot: d.slot, damage: dmg, move: move.id, counter: false, combo: a.comboHits, dirX: kickDir })
    this.game.audio.sfx('throw')
    this.game.events.emit('camera:shake', { mag: 0.45 })
    this.particles.burst('impact', { x: d.pos.x, y: d.pos.y + 1, z: d.pos.z })
    const kb = move.knockback || { x: 9, y: 6, spin: 2 }
    // ragdolls.full applies the preset scaling itself — pass raw values.
    const kx = (kb.x ?? 9) * a.knockbackMult
    const kyv = Math.abs(kb.y ?? 6) * a.knockbackMult
    if (d.hp <= 0) {
      this._killBlow = { moveId: move.id, kind: move.kind || 'grab' } // §23
      this.forceRagdoll(d, [fdx * kx, Math.max(kyv, 6), fdz * kx], kb.spin ?? 2)
      this.onKO(d)
      return
    }
    this.forceRagdoll(d, [fdx * kx, kyv, fdz * kx], kb.spin ?? 2)
  }

  // ------------------------------------------------------------------ ragdoll

  // §17 single-owner handoff (v2.0 P0): while f.state === 'ragdoll' the
  // RagdollManager's full driver OWNS the fighter's bones. Flipping the
  // logical state to hitstun/launched without releasing the driver leaves the
  // driver pinning the pose for up to 10 frames (visible freeze) until the
  // watchdog force-recovers it (visible pop) — while the logical fighter
  // walks away from its own model. EVERY external launch/hitstun (script
  // hits, items, arena hazards) must route through these two helpers: a
  // ragdolled fighter never has its state flipped — the hit is converted
  // into an additive ragdoll impulse instead, matching isInvulnerable()
  // (which already lists 'ragdoll' for the normal hit path).
  launchFighter(f, vx, vy, spin, vz = 0) {
    if (f.state === 'ragdoll') { this.applyImpulse(f, [vx, vy, vz], spin); return }
    f.enterLaunched(vx, vy, spin, vz)
  }

  stunFighter(f, frames, heavy, kbx, kbz = 0) {
    if (f.state === 'ragdoll') { this.applyImpulse(f, [kbx, 1.5, kbz], 0.4); return }
    f.enterHitstun(frames, heavy, kbx, kbz)
  }

  forceRagdoll(f, impulse, spin = 1) {
    if (f.state === 'ragdoll') {
      this.applyImpulse(f, impulse, spin)
      return
    }
    f.scriptFx?.end()
    f.currentMove = null
    f.scriptFx = null
    f.releaseGrabVictim?.() // never leave a victim stuck in 'grabbed'
    f.clearBuffs() // getting ragdolled ends your bull run
    f.state = 'ragdoll'
    f.stateFrames = 0
    f.ragdollFrames = 0
    f.fallFrames = 0 // fresh fall: OTG clock restarts, OTG latch re-arms
    f.otgHit = false
    f.holder.rotation.z = 0
    f.tumble = 0
    f.flash()
    try { this.ragdolls.full(f, impulse, spin) } catch (e) { console.warn('[combat] ragdolls.full failed', e) }
    try { this.arena.onRagdollLaunch?.(f) } catch { /* arena hook optional */ }
    this.game.audio.crowd('gasp')
  }

  _recoverFromRagdoll(f) {
    const instant = this._settleRagdoll(f)
    f.invuln = 30
    // v2.1 mobile-feel pass: post-settle 'down beat' 22 -> 10 frames
    f.knockdownFrames = 10
    f.state = 'knockdown'
    f.stateFrames = 0
    // instant path must also snap the ANIMATOR: its crossfade snapshots the
    // current (stale, ragdoll-driven) bone locals, which re-express against
    // the teleported root — same tripwire through a different door.
    f.animator.play('knockdown', { restart: true, snap: instant })
  }

  // Hand the bones back from the full-ragdoll driver and park the logical
  // fighter at the pile's floor spot. Shared by the normal recovery and the
  // OTG forced getup. Returns true when the handoff was INSTANT (root jump
  // >1m — the caller must snap its clip, see below).
  //
  // Compute the hips-settle target BEFORE choosing the handoff. A blended
  // recover() snapshots bone LOCAL transforms against the CURRENT root, so
  // teleporting f.pos in the same frame re-expresses that snapshot the full
  // flight distance away for the blend frames — the mid-fight "model desynced
  // from body" tripwire. Long root jump (>1m) => instant handoff instead:
  // the Animator rewrites the whole pose next frame and the snapped clip
  // masks the cut. Short jump => keep the smooth 260ms blend.
  _settleRagdoll(f) {
    let tx = f.pos.x
    let tz = f.pos.z
    try {
      const v = new THREE.Vector3()
      f.bones.hips.getWorldPosition(v)
      if (Number.isFinite(v.x)) tx = Math.max(this.bounds.minX + 0.4, Math.min(this.bounds.maxX - 0.4, v.x))
      if (Number.isFinite(v.z)) {
        tz = Math.max((this.bounds.minZ ?? DEFAULT_MIN_Z) + 0.4, Math.min((this.bounds.maxZ ?? DEFAULT_MAX_Z) - 0.4, v.z))
      }
    } catch { /* keep old xz */ }
    const rootJump = Math.hypot(tx - f.pos.x, tz - f.pos.z)
    const instant = rootJump > 1
    try { this.ragdolls.recover(f, instant ? 1 : 260) } catch { /* stub */ }
    f.pos.x = tx
    f.pos.z = tz
    f.pos.y = 0
    f.vel.set(0, 0, 0)
    return instant
  }

  applyImpulse(target, vec, spin = 0) {
    const v = Array.isArray(vec) ? vec : [vec?.x || 0, vec?.y || 0, vec?.z || 0]
    if (target === this.fighters[0] || target === this.fighters[1]) {
      const f = target
      if (f.state === 'ragdoll') {
        try { this.ragdolls.full(f, v, spin) } catch { /* stub */ }
        return
      }
      f.vel.x += v[0]
      f.vel.y += v[1]
      f.vel.z += v[2] || 0
      if (f.vel.y > 2.5 && f.grounded() && f.state !== 'attack' && f.state !== 'finisher') {
        f.enterLaunched(f.vel.x, f.vel.y, spin, f.vel.z)
      }
      return
    }
    if (target) { try { this.physics.impulse(target, v) } catch { /* stub */ } }
  }

  // ------------------------------------------------------- auto executions (§23)

  // Pick an execution for the tier. The pool module (parallel build) exposes
  // pickTier(tier, { excludeId, context }); every access is stub-guarded — a
  // missing/legacy/broken pool degrades to the legacy pick() (absurd tier) or
  // to the attacker's signature finisher or the inline generic script.
  _pickExecution(tier, a, context) {
    const excludeId = this.lastExecutionIds[tier] ?? null
    let ex = null
    try {
      if (ExecutionPool && typeof ExecutionPool.pickTier === 'function') {
        ex = ExecutionPool.pickTier(tier, { excludeId, context })
      } else if (tier === 'absurd' && ExecutionPool && typeof ExecutionPool.pick === 'function') {
        ex = ExecutionPool.pick(excludeId) // legacy pool = the 8 absurd scripts
      }
    } catch (e) { console.warn('[combat] execution pool failed', e); ex = null }
    if (ex && typeof ex.script !== 'function') ex = null
    // §23: the attacker's signature finisher is folded into the absurd pool by
    // pickTier itself (as `signature-<id>`, evenly weighted, exclude-deduped).
    // Here it is ONLY the degraded fallback for a missing/broken pool — built
    // with the pool's exact id scheme so the no-repeat guard keeps matching.
    const sig = a?.def?.finisher
    if (!ex && tier === 'absurd' && sig && typeof sig.script === 'function') {
      const sigId = `signature-${sig.id || a.def.id}`
      if (sigId !== excludeId) ex = { id: sigId, name: sig.name, script: sig.script }
    }
    return ex
  }

  // Runs the picked execution through the proven finisher-script machinery:
  // phase 'finisher' (fx damage lock + replay capture), winner in 'finisher'
  // state, victim in 'grabbed', KO cinematic camera, one SpecialContext.
  _startExecution(a, d) {
    if (!this.active || this.phase !== 'ko') return
    const kb = this._killBlow || {}
    const tier = TIER_FOR_KIND[kb.kind] || 'basic'
    const context = {
      killingMoveId: kb.moveId ?? null,
      killingKind: kb.kind ?? null,
      attackerCharId: a?.def?.id ?? null,
    }
    const ex = this._pickExecution(tier, a, context)
    this.phase = 'finisher'
    this._flushFx() // run pending buff/visual reverts before the cinematic owns the stage
    this.timeScale = 1
    this.slowmoFrames = 0
    this.finisherUsed = true
    this.game.events.emit('finisher:start', { slot: a.slot })
    this.game.events.emit('execution:start', { slot: a.slot, tier, id: ex?.id ?? 'generic' })
    if (ex?.id != null) this.lastExecutionIds[tier] = ex.id
    // §17 single-owner handoff: if the full-ragdoll driver still owns either
    // body (the KO beat ragdolled the victim, trades can ragdoll the winner),
    // hand the bones back BEFORE the state flips — otherwise the driver keeps
    // pinning poses until the watchdog force-pops them mid-cinematic.
    if (a.state === 'ragdoll') { try { this.ragdolls.recover(a, 120) } catch { /* stub */ } }
    a.state = 'finisher'
    a.stateFrames = 0
    a.vel.set(0, 0, 0)
    a.currentMove = null
    a.scriptFx = null
    if (d.state === 'ragdoll') { try { this.ragdolls.recover(d, 120) } catch { /* stub */ } }
    d.currentMove = null
    d.scriptFx?.end()
    d.state = 'grabbed'
    d.stateFrames = 0
    d.vel.set(0, 0, 0)
    this.game.audio.crowd('gasp')
    // Real cinematic, not just the mode flag — koCinematic orbits/dollies and
    // tracks the victim; scripts layer their own beats via fx.cam().
    try { this.cam.koCinematic(d) } catch { /* stub */ }
    this._cut()   // #6: execution cinematic re-frames the stage
    const fx = this.makeFx(a, () => this._executionDone(a, d))
    fx.context = context // §23: absurd scripts echo the special that landed
    this._execFx = fx
    this._execA = a
    this._execD = d
    this._execSkipFrame = this.worldFrame + 18 // grace: KO-mash never insta-skips
    const cap = TIER_CAP[tier] ?? 300
    this.at(cap, () => { if (!fx.done) fx.end() }) // safety: scripts must end
    if (ex) {
      if (ex.name) this.cap(String(ex.name).toUpperCase() + '!')
      try { ex.script(fx) } catch (e) {
        console.error('[combat] execution script threw', e)
        fx.end()
      }
    } else {
      // stub-safe generic execution (pool tier not built yet)
      this.cap('FULL LIQUIDATION!')
      fx.after(20, () => {
        fx.sfx('explosion')
        fx.shake(1.4)
        fx.coins({ x: d.pos.x, y: d.pos.y + 1.4, z: d.pos.z }, 26)
        fx.hit({ damage: 12, knockback: { x: 15, y: 10, spin: 3 }, ragdoll: 2 })
        fx.slowmo(0.25, 0.9)
      })
      fx.after(85, () => fx.end())
    }
  }

  _executionDone(a, d) {
    if (this.phase !== 'finisher') return
    this.phase = 'ko'
    this._execFx = null
    d.setHp(0)
    d.clearBuffs()
    if (d.state !== 'ragdoll') {
      // scripts that end without their own ragdoll still get the flop
      let dx = d.pos.x - a.pos.x
      let dz = d.pos.z - a.pos.z
      const dd = Math.hypot(dx, dz)
      if (dd > 1e-4) { dx /= dd; dz /= dd } else { dx = a.dirX(); dz = a.dirZ() }
      this.forceRagdoll(d, [dx * 7, 6, dz * 7], 1.5)
    }
    if (a.state === 'finisher') { a.state = 'idle'; a.stateFrames = 0 }
    this.at(20, () => { if (a.state !== 'ragdoll') a.setState('win') })
    this.at(70, () => this._endRound(a.slot))
  }

  // §23 SKIP: any button/tap during execution playback flushes the script's
  // pending cleanup (the proven fx-flush machinery) and cuts straight to the
  // round end. Wired to 'input:any' + window pointerdown in enter().
  _skipExecution() {
    if (this.phase !== 'finisher' || !this._execFx || this.paused || this.replayActive) return
    if (this.worldFrame < (this._execSkipFrame || 0)) return
    const a = this._execA
    const d = this._execD
    if (!a || !d) return
    this.phase = 'ko' // guard first: the flush's fx.end() onEnd must no-op
    this._execFx = null
    this._flushFx()
    this.timeScale = 1
    this.slowmoFrames = 0
    this.hitStopFrames = 0
    d.setHp(0)
    d.clearBuffs()
    if (d.state !== 'ragdoll') {
      d.pos.y = Math.max(0, d.pos.y)
      this.forceRagdoll(d, [-d.dirX() * 5, 5, -d.dirZ() * 5], 1)
    }
    if (a.state === 'finisher') { a.state = 'idle'; a.stateFrames = 0 }
    if (a.state !== 'ragdoll') a.setState('win')
    this.game.events.emit('execution:skip', { slot: a.slot })
    this.at(8, () => this._endRound(a.slot))
  }

  // ------------------------------------------------------------------ fx plumbing

  makeFx(self, onEnd) {
    const fx = new SpecialContext(this, self, self.foe, onEnd)
    this.fxList.push(fx)
    return fx
  }

  // Flush every pending fx.after callback (buff reverts, material restores) so
  // cleanup scheduled late in a round is never dropped by a reset. Called on
  // round reset, match end, finisher start and screen exit.
  _flushFx() {
    const list = this.fxList
    this.fxList = []
    for (const fx of list) {
      try { fx.flush() } catch (e) { console.error('[combat] fx flush threw', e) }
    }
  }

  // fx.hit — knockback keeps its v1 {x, y} shape: x is the horizontal
  // magnitude ALONG THE ATTACKER'S FACING (resolved to a 3D direction here),
  // y is up. Every character script keeps working untouched.
  applyScriptHit(self, foe, spec = {}) {
    const locked = this.phase === 'finisher'
    const fdx = typeof self?.dirX === 'function' ? self.dirX() : (self?.facing || 1)
    const fdz = typeof self?.dirZ === 'function' ? self.dirZ() : 0
    const kickDir = Math.sign(fdx) || self?.facingSign || 1
    let dmg = Math.max(0, Math.round(spec.damage || 0))
    if (dmg > 0) {
      const scale = locked ? 1 : Math.max(0.3, Math.pow(0.9, self.comboHits))
      dmg = Math.max(1, Math.round(dmg * scale * self.damageMult))
      // during an execution cinematic, hp is held at 1 until the script ends —
      // KO pacing belongs to the cinematic, not to an early hit. §23: a victim
      // already at 0 (auto executions fire POST-KO) stays at 0, never healed.
      const floor = locked ? Math.min(1, Math.max(0, foe.hp)) : 0
      this._goreHit(foe, self, dmg, spec.pos ? { x: spec.pos.x ?? foe.pos.x, y: spec.pos.y ?? foe.pos.y + 1.1, z: spec.pos.z ?? foe.pos.z } : { x: foe.pos.x, y: foe.pos.y + 1.1, z: foe.pos.z }, kickDir)
      foe.setHp(Math.max(floor, foe.hp - dmg))
      foe.damageTakenThisRound += dmg
      self.comboHits++
      self.comboLastFrame = this.worldFrame
      this._trackHit(self, dmg)
      self.gainMeter(4)
      foe.gainMeter(dmg * 0.3)
      this.game.events.emit('fighter:hit', { slot: foe.slot, damage: dmg, move: 'script', counter: false, combo: self.comboHits, dirX: kickDir })
      if (self.comboHits >= 2) this.game.events.emit('combo', { slot: self.slot, hits: self.comboHits })
    }
    const pt = spec.pos
      ? { x: spec.pos.x ?? foe.pos.x, y: spec.pos.y ?? foe.pos.y + 1.1, z: spec.pos.z ?? foe.pos.z }
      : { x: foe.pos.x, y: foe.pos.y + 1.1, z: foe.pos.z }
    this.particles.burst('impact', pt, { dirX: kickDir })
    if (dmg >= 8) {
      this.game.audio.sfx('punch_heavy')
      this.hitStop(dmg >= 16 ? 6 : 3) // big scripted hits earn super-weight freeze
    } else if (dmg > 0) {
      this.game.audio.sfx('punch_light')
    }

    const kb = spec.knockback || {}
    const kbm = self.knockbackMult || 1
    const rag = spec.ragdoll || 0
    if (!locked && foe.hp <= 0) {
      // §23: scripted kills carry the live special/super when one is running
      this._killBlow = {
        moveId: self?.currentMove?.id ?? 'script',
        kind: self?.currentMove?.kind ?? 'special',
      }
      const k = (kb.x ?? 8) * kbm
      this.forceRagdoll(foe, [fdx * k, Math.max((kb.y ?? 6) * kbm, 6), fdz * k], (kb.spin ?? 1.5))
      this.onKO(foe)
      return
    }
    if (rag >= 2) {
      const k = (kb.x ?? 8) * kbm
      if (locked) {
        // ragdoll is allowed inside finishers — it IS the cinematic
        this.forceRagdoll(foe, [fdx * k, Math.max((kb.y ?? 6) * kbm, 4), fdz * k], (kb.spin ?? 1.5))
      } else {
        this.forceRagdoll(foe, [fdx * k, Math.max((kb.y ?? 5) * kbm, 3.5), fdz * k], (kb.spin ?? 1.5))
      }
      return
    }
    if (rag === 1) { try { this.ragdolls.partial(foe, 'upper', [fdx * (kb.x ?? 4) * 0.5, 2, fdz * (kb.x ?? 4) * 0.5]) } catch { /* stub */ } }
    if (locked) {
      foe.animator.play(dmg >= 10 ? 'hitHeavy' : 'hitLight', { restart: true })
      foe.flash()
      foe.squash(0.25)
      return
    }
    if ((kb.y ?? 0) * kbm > 3 || !foe.grounded()) {
      const k = (kb.x ?? 4) * kbm
      this.launchFighter(foe, fdx * k, Math.max((kb.y ?? 5) * kbm, 4), kb.spin ?? 1, fdz * k)
    } else if (spec.hitStun) {
      const k = (kb.x ?? 3) * 0.5 * kbm
      this.stunFighter(foe, spec.hitStun, dmg >= 10, fdx * k, fdz * k)
    } else if (dmg > 0) {
      foe.flash()
      foe.squash(0.2)
    }
  }

  // ------------------------------------------------------------------ items (v1.1 §14)

  // Runs only during phase 'fight' inside the fixed step, so item use
  // automatically respects pause, hit-stop, slow-mo and finisher locks (those
  // either freeze the step or switch the phase). Any throw from the parallel-
  // built ItemSystem disarms it for the rest of the match instead of crashing.
  _updateItems(dt) {
    const items = this.items
    try {
      items.update(dt)
      for (const f of this.fighters) {
        items.tryPickup(f) // walk-over auto-pickup; the system self-checks overlap/hands
        if (!ITEM_OK_STATES.has(f.state)) continue
        const ai = f.ctrl instanceof AIControl
        if (!ai) {
          if (f.ctrl.pressed('item')) items.use(f)
        } else if (f.ctrl.level >= 2 && f.foe && items.held(f.slot) &&
          items.aiShouldUse(f) && Math.random() < 0.03 + 0.015 * f.ctrl.level) {
          // §14 AI heuristic: use the held item as soon as its own range hint
          // (ItemSystem.aiShouldUse — melee/ranged/trap/self aware) says the
          // spacing is right; the per-frame roll (~0.2 s expected at level 3)
          // jitters the timing so it never reads as a metronome
          items.use(f)
        }
      }
    } catch (e) {
      console.error('[combat] item system threw — items disabled for this match', e)
      this.items = null
      try { items.dispose?.() } catch { /* already broken */ }
    }
  }

  // (v2.0: _aiItemSteer removed — the Brain owns 2D item routing, §17.)

  // Ground-item mirror upkeep (spawn/pickup/despawn events). Despawn payloads
  // only carry the kind; with max 2 on the ground, first-match removal is fine
  // for a heuristic.
  _dropGroundItem(kind) {
    const list = this._groundItems
    if (!list?.length) return
    const i = kind != null ? list.findIndex((it) => it.kind === kind) : 0
    list.splice(i >= 0 ? i : 0, 1)
  }

  // ------------------------------------------------------------------ gore (v1.1 §15)

  // Every gore call funnels through here: the module is a parallel build and
  // must never take the match down — first throw disables it for the match.
  _goreSafe(fn) {
    if (!this.gore) return
    try { fn(this.gore) } catch (e) {
      console.error('[combat] gore system threw — gore disabled for this match', e)
      const g = this.gore
      this.gore = null
      try { g.dispose?.() } catch { /* already broken */ }
    }
  }

  // Attributed damage → gore. Called at EVERY damage application point BEFORE
  // setHp, marking the frame so the un-attributed setHp fallback (onHpLoss)
  // never double-fires for the same hit. Because the call runs pre-application,
  // the POST-hit hp is passed explicitly (v1.1.1 P2 fix: thresholds must fire
  // on the hit that crosses them, not one hit late) — hpAfter overrides the
  // default `victim.hp - damage` for callers whose hp is already applied.
  _goreHit(victim, attacker, damage, pos, dirX, hpAfter) {
    victim._goreFrame = this.worldFrame
    this._goreSafe((g) => g.onDamage(victim, {
      attacker,
      damage,
      hp: Number.isFinite(hpAfter) ? hpAfter : Math.max(0, victim.hp - damage),
      pos: { x: pos?.x ?? victim.pos.x, y: pos?.y ?? victim.pos.y + 1.1, z: pos?.z ?? 0 },
      dir: { x: dirX || (attacker ? attacker.facingSign : -victim.facingSign) || 1, y: 0.25, z: 0 },
    }))
  }

  // Fighter.setHp reports every hp drop here — this catches arena-hazard
  // damage, which calls f.setHp directly and never routes through _resolveHit.
  // Runs AFTER the hp write, so f.hp already IS the post-hit value.
  onHpLoss(f, amount) {
    if (!this.gore || f._goreFrame === this.worldFrame) return
    this._goreHit(f, null, amount, { x: f.pos.x, y: f.pos.y + 1.1, z: f.pos.z }, -f.facingSign, f.hp)
  }

  // ------------------------------------------------------------------ misc

  _pushApart() {
    const [a, b] = this.fighters
    const pushable = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'block', 'attack'])
    if (!pushable.has(a.state) || !pushable.has(b.state)) return
    if (!a.grounded() || !b.grounded()) return
    const minDist = 0.85
    const dx = b.pos.x - a.pos.x
    const dz = b.pos.z - a.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist >= minDist) return
    let nx, nz
    if (dist > 1e-4) { nx = dx / dist; nz = dz / dist } else { nx = a.facingSign; nz = 0 }
    const push = (minDist - dist) / 2
    a.pos.x -= nx * push
    a.pos.z -= nz * push
    b.pos.x += nx * push
    b.pos.z += nz * push
    const pad = 0.35
    const bd = this.bounds
    const minZ = (bd.minZ ?? DEFAULT_MIN_Z) + pad, maxZ = (bd.maxZ ?? DEFAULT_MAX_Z) - pad
    for (const f of [a, b]) {
      f.pos.x = Math.max(bd.minX + pad, Math.min(bd.maxX - pad, f.pos.x))
      f.pos.z = Math.max(minZ, Math.min(maxZ, f.pos.z))
    }
  }

  // PS2-era super announcement: freeze the sim like hit-stop, punch the camera
  // in, and let the HUD paint a fullscreen white pulse + name beat. Called by
  // Fighter.startMove for kind 'super' — pure presentation, no sim effects.
  superFlash(f, move) {
    this.hitStopFrames = Math.max(this.hitStopFrames, 24) // ~0.4 s frozen beat
    try { this.cam.punchIn(0.4) } catch { /* stub */ }
    // The HUD already paints its white DOM pulse; this is the 3D half of it.
    this._impactFx(1)
    try { this.game?.pipeline?.flash?.(0xffffff, 0.45, 10) } catch { /* post is optional */ }
    this.game.events.emit('superflash', { slot: f.slot, name: move?.name || 'SUPER' })
    this.game.events.emit('camera:shake', { mag: 0.3 })
    this.game.audio.crowd('gasp')
  }

  // One-line guarded bridge to RenderPipeline.impact(). Everything that wants a
  // post punch goes through here so there is exactly one place that knows the
  // pipeline may be absent (low tier, construction failure, node harness).
  _impactFx(strength = 1) {
    try { this.game?.pipeline?.impact?.(strength) } catch { /* post is optional */ }
  }

  hitStop(frames) {
    this.hitStopFrames = Math.max(this.hitStopFrames, frames)
    // impact-scaled zoom punch: jabs whisper (~0.09s), supers slam (0.28s cap —
    // punchIn's amount curve also tops out there, so heavies read HEAVY)
    try { this.cam.punchIn(Math.min(0.28, 0.06 + frames * 0.015)) } catch { /* stub */ }
  }

  setSlowmo(scale, seconds) {
    this.timeScale = Math.max(0.05, Math.min(1, scale ?? 0.3))
    this.slowmoFrames = Math.max(1, Math.round((seconds ?? 1) * 60))
    this.game.events.emit('slowmo', { scale: this.timeScale, seconds: seconds ?? 1 })
  }

  at(frames, cb) { this.timers.push({ n: Math.max(1, Math.round(frames)), cb }) }

  say(line, throttleFrames = 0) {
    line = String(line).toUpperCase()
    if (throttleFrames > 0) {
      const last = this._sayLog.get(line) ?? -99999
      if (this.worldFrame - last < throttleFrames) return
    }
    this._sayLog.set(line, this.worldFrame)
    this.game.events.emit('announcer', { line })
    this.game.audio.announcer(line)
  }

  // Captions are the arcade shout layer — always uppercase, no exceptions.
  cap(text) { this.game.events.emit('caption', { text: String(text).toUpperCase() }) }

  _buildFallbackFloor() {
    // minimal stage so the match is playable before the arena module lands
    const g = new THREE.Group()
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(
        this.bounds.maxX - this.bounds.minX + 6, 0.5,
        (this.bounds.maxZ ?? DEFAULT_MAX_Z) - (this.bounds.minZ ?? DEFAULT_MIN_Z) + 6
      ),
      new THREE.MeshLambertMaterial({ color: 0x2c3150 })
    )
    floor.position.y = -0.25
    floor.receiveShadow = true
    g.add(floor)
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(this.bounds.maxX - this.bounds.minX, 0.02, 0.15),
      new THREE.MeshLambertMaterial({ color: 0xf7c948 })
    )
    line.position.y = 0.02
    g.add(line)
    this.scene.add(g)
    try { this.physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 60, y: 0.5, z: 30 }) } catch { /* stub */ }
  }
}
