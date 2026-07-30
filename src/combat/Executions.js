// KO execution pools — CONTRACTS.md §23 (auto KO executions, v2.1; §21 pool
// retained as the ABSURD tier). Every round-ending KO plays an execution picked
// by the killing blow's move kind:
//   ExecutionPool.pickTier(tier, { excludeId, context })
//     tier:    'basic' (light/kick — 2-3s flourishes)
//            | 'heavy' (heavy/launcher/grab/throw — 3-4s)
//            | 'absurd' (special/super — 4-6s, the §21 eight + extras)
//     context: { killingMoveId, killingKind, attackerCharId } — also delivered
//              to scripts as fx.context by MatchScreen.
// ABSURD extras: scripts open with a 0.5s ECHO beat of the special that landed
// (attacker flash + the move's sfx + a scaled ghost of its signature prop for
// the flashiest recognizable ids), and the ATTACKER's signature finisher joins
// their absurd rotation (Characters registry read-only).
// `ExecutionPool.pick(excludeId)` stays as a back-compat alias for the absurd
// tier (the §21 50/50 finisher flow).
//
// Every script:
//   - runs 2-6s on the fixed clock through the standard SpecialContext `fx`
//     (same API finisher scripts get — §6),
//   - is ARENA-AGNOSTIC: everything is anchored on the victim's live XZ position
//     and clamped to the arena bounds (free-roam: fighters can be anywhere),
//   - builds its bespoke hero meshes inline (low-poly, flat-shaded) and spawns
//     tumbling debris through fx.spawnProp (physics-managed),
//   - is GORE-AWARE: blood bursts only when settings.gore != 'none'
//     (Particles.js additionally self-gates — double safety),
//   - is RESTORE-SAFE: guarded single end(), all cleanup runs on fx.after
//     timers (which survive end() and are force-run by fx.flush() on round
//     reset / match teardown), cleanup is idempotent, no leaked meshes.
import * as THREE from 'three'
import { Characters } from '../characters/index.js' // READ-ONLY registry (§23)

// ---------------------------------------------------------------------------
// shared helpers (same discipline as the shipped character finishers)
// ---------------------------------------------------------------------------
function v3(x, y, z) { return new THREE.Vector3(x, y, z) }

// end() guard so parallel timelines can never call fx.end() twice
function onceEnd(fx) {
  let done = false
  return () => { if (!done) { done = true; fx.end() } }
}

function bounds(fx) {
  let b = null
  try { b = fx.arena()?.bounds } catch { /* arena optional in stubs */ }
  return {
    minX: Number.isFinite(b?.minX) ? b.minX : -9,
    maxX: Number.isFinite(b?.maxX) ? b.maxX : 9,
    minZ: Number.isFinite(b?.minZ) ? b.minZ : -5.5,
    maxZ: Number.isFinite(b?.maxZ) ? b.maxZ : 5.5,
  }
}

function clampX(fx, x, m = 0.8) {
  const b = bounds(fx)
  return Math.max(b.minX + m, Math.min(b.maxX - m, x))
}
function clampZ(fx, z, m = 0.8) {
  const b = bounds(fx)
  return Math.max(b.minZ + m, Math.min(b.maxZ - m, z))
}

// Victim anchor — the KO'd fighter everything is staged around.
function anchor(fx) {
  const p = fx.foe?.pos
  return v3(p?.x || 0, 0, p?.z || 0)
}

// Unit XZ direction from the victim toward the arena side with the most room
// (so launches/exits always travel INTO open space, never straight into the
// nearest wall). Returns { x, z, room }.
function openDir(fx) {
  const b = bounds(fx)
  const p = anchor(fx)
  const sides = [
    { x: 1, z: 0, room: b.maxX - p.x },
    { x: -1, z: 0, room: p.x - b.minX },
    { x: 0, z: 1, room: b.maxZ - p.z },
    { x: 0, z: -1, room: p.z - b.minZ },
  ]
  sides.sort((a, c) => c.room - a.room)
  return sides[0]
}

// Vehicle lane through the victim: travel along the arena's longest axis,
// heading toward the side with the most room past the victim. Returns
// { dx, dz, enter: Vector3, hit: Vector3, exit: Vector3, yaw }.
function laneThrough(fx, enterDist = 7, exitDist = 6, y = 0) {
  const b = bounds(fx)
  const p = anchor(fx)
  const alongX = (b.maxX - b.minX) >= (b.maxZ - b.minZ)
  let dx = 0, dz = 0
  if (alongX) dx = (b.maxX - p.x >= p.x - b.minX) ? 1 : -1
  else dz = (b.maxZ - p.z >= p.z - b.minZ) ? 1 : -1
  const cx = (x) => clampX(fx, x, 0.4)
  const cz = (z) => clampZ(fx, z, 0.4)
  return {
    dx, dz,
    enter: v3(cx(p.x - dx * enterDist), y, cz(p.z - dz * enterDist)),
    hit: v3(p.x, y, p.z),
    exit: v3(cx(p.x + dx * exitDist), y, cz(p.z + dz * exitDist)),
    yaw: Math.atan2(-dz, dx), // meshes are built facing +X
  }
}

function gore(fx) {
  try {
    return (fx.match?.game?.save?.get?.('settings.gore', 'cartoon') ?? 'cartoon') !== 'none'
  } catch { return true }
}
function blood(fx, name, pos, opts) { if (gore(fx)) fx.particles(name, pos, opts) }

function playFoe(fx, clip) { try { fx.foe?.playClip?.(clip) } catch { /* rig optional */ } }
function playSelf(fx, clip) { try { fx.self?.playClip?.(clip) } catch { /* rig optional */ } }

// Attacker anchor (for beats staged on the winner).
function selfPos(fx) {
  const p = fx.self?.pos
  return v3(p?.x || 0, 0, p?.z || 0)
}

// Scripted cinematic camera beat ('push' low-angle push-in, 'orbit' whip-orbit
// on the payoff, 'hold' wide aftermath settle). Optional-chained so headless
// harness/stub fx objects without the hook stay silent.
function camBeat(fx, name) { try { fx.cam?.(name) } catch { /* camera optional */ } }

// --- mesh kit -------------------------------------------------------------
function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra })
}
function bx(w, h, d, color, extra) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra))
}
function cyl(rTop, rBot, h, color, seg = 8, extra) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color, extra))
}

// --- stage: tracked meshes + tween/spin driver + idempotent cleanup -------
const easeIn = (k) => k * k
const easeOut = (k) => 1 - (1 - k) * (1 - k)
const smooth = (k) => k * k * (3 - 2 * k)

function makeStage(fx) {
  // Stage time is RELATIVE to stage creation (not fx creation) so scripts that
  // start after an fx.after delay — e.g. behind the absurd-tier echo beat —
  // keep their authored timings.
  const t0 = fx.age || 0
  const stage = { fx, meshes: [], tweens: [], spins: [], bobs: [], scales: [], dead: false }
  fx.frame((rawAge) => {
    const age = rawAge - t0
    for (const t of stage.tweens) {
      if (t.fired || age < t.f0) continue
      if (!t.from) t.from = t.mesh.position.clone()
      const k = t.f1 <= t.f0 ? 1 : Math.min(1, (age - t.f0) / (t.f1 - t.f0))
      const e = (t.ease || smooth)(k)
      t.mesh.position.set(
        t.from.x + (t.to.x - t.from.x) * e,
        t.from.y + (t.to.y - t.from.y) * e,
        t.from.z + (t.to.z - t.from.z) * e
      )
      if (k >= 1) { t.fired = true; try { t.onDone?.() } catch (e2) { console.error('[combat] execution tween cb threw', e2) } }
    }
    for (const s of stage.spins) {
      if (age < (s.f0 || 0) || (s.f1 && age > s.f1)) continue
      s.mesh.rotation[s.axis] += s.speed
    }
    for (const b of stage.bobs) {
      if (age < (b.f0 || 0) || (b.f1 && age > b.f1)) continue
      b.mesh.position.y = b.base + Math.abs(Math.sin((age - (b.f0 || 0)) * b.rate)) * b.amp
    }
    for (const s of stage.scales) {
      if (s.fired || age < s.f0) continue
      const k = s.f1 <= s.f0 ? 1 : Math.min(1, (age - s.f0) / (s.f1 - s.f0))
      s.mesh.scale.setScalar(s.from + (s.to - s.from) * (s.ease || smooth)(k))
      if (k >= 1) s.fired = true
    }
  })
  return stage
}

// Add a bespoke mesh to the arena group (falls back gracefully in headless
// stubs) and track it for cleanup.
function addMesh(stage, mesh, pos) {
  if (pos) mesh.position.copy(pos)
  mesh.traverse?.((o) => { if (o.isMesh) o.castShadow = true })
  try { stage.fx.arena()?.group?.add?.(mesh) } catch { /* headless */ }
  stage.meshes.push(mesh)
  return mesh
}

function tween(stage, mesh, to, f0, f1, opts = {}) {
  stage.tweens.push({ mesh, to: to.clone ? to.clone() : v3(to.x, to.y, to.z), f0, f1, ease: opts.ease, onDone: opts.onDone })
}
function spin(stage, mesh, axis, speed, f0 = 0, f1 = 0) { stage.spins.push({ mesh, axis, speed, f0, f1 }) }
function bob(stage, mesh, amp, rate, f0 = 0, f1 = 0) { stage.bobs.push({ mesh, base: mesh.position.y, amp, rate, f0, f1 }) }
function grow(stage, mesh, from, to, f0, f1, ease) {
  mesh.scale.setScalar(from)
  stage.scales.push({ mesh, from, to, f0, f1, ease })
}

// Idempotent teardown: detach + dispose every tracked mesh. Scheduled via
// fx.after so fx.flush() (round reset / match end) always runs it.
function cleanupStage(stage) {
  if (stage.dead) return
  stage.dead = true
  for (const mesh of stage.meshes) {
    try {
      mesh.parent?.remove?.(mesh)
      mesh.traverse?.((o) => {
        if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.() }
      })
    } catch { /* already gone */ }
  }
  stage.meshes.length = 0
  stage.tweens.length = 0
  stage.spins.length = 0
  stage.bobs.length = 0
  stage.scales.length = 0
}

// ---------------------------------------------------------------------------
// 1. MARKET STEAMROLLER — a gold-bar steamroller flattens them into a coin
// ---------------------------------------------------------------------------
function buildSteamroller() {
  const g = new THREE.Group()
  const drum = cyl(0.85, 0.85, 1.7, 0xd9dee8, 10)
  drum.rotation.x = Math.PI / 2
  drum.position.set(1.15, 0.85, 0)
  g.add(drum)
  // body = a stack of gold bars (trapezoid-ish via offset boxes)
  for (let i = 0; i < 3; i++) {
    const bar = bx(2.2 - i * 0.3, 0.5, 1.5 - i * 0.25, 0xffcf3f)
    bar.position.set(-0.7, 0.9 + i * 0.5, 0)
    g.add(bar)
  }
  const cab = bx(1.0, 0.9, 1.1, 0x2a2e38)
  cab.position.set(-1.1, 2.6, 0)
  g.add(cab)
  const stack = cyl(0.12, 0.16, 0.9, 0x444a58, 6)
  stack.position.set(-0.2, 2.6, 0.45)
  g.add(stack)
  const wheelL = cyl(0.55, 0.55, 0.3, 0x22242c, 8)
  wheelL.rotation.x = Math.PI / 2
  wheelL.position.set(-1.5, 0.55, 0.8)
  const wheelR = wheelL.clone()
  wheelR.position.z = -0.8
  g.add(wheelL); g.add(wheelR)
  return { g, drum }
}

const MarketSteamroller = {
  id: 'market-steamroller',
  name: 'MARKET STEAMROLLER',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const lane = laneThrough(fx, 7.5, 5.5)
    const p = anchor(fx)

    fx.slowmo(0.5, 0.9)
    fx.zoom(fx.foe, 0.8)
    fx.caption('HEAVY MACHINERY ON THE FLOOR')
    fx.sfx('klaxon')
    fx.shake(0.35)
    playFoe(fx, 'knockdown')
    camBeat(fx, 'push') // low angle on the victim as the roller bears down

    const { g: roller, drum } = buildSteamroller()
    roller.rotation.y = lane.yaw
    addMesh(stage, roller, lane.enter)
    spin(stage, drum, 'y', -0.22, 10, 200) // drum axis is local Y after the X-flip
    tween(stage, roller, lane.hit, 14, 68, { ease: easeIn })
    fx.after(10, () => fx.sfx('drone_hum'))
    for (let i = 0; i < 6; i++) {
      fx.after(16 + i * 9, () => {
        fx.particles('dust', v3(roller.position.x, 0.2, roller.position.z), { n: 4 })
        fx.shake(0.15 + i * 0.05)
      })
    }

    // marquee stretch: dread beat right before the drum arrives
    fx.after(56, () => fx.slowmo(0.35, 0.9))

    // SPLAT — over the victim
    fx.after(68, () => {
      camBeat(fx, 'orbit')
      fx.sfx('break'); fx.sfx('thud')
      fx.shake(1.3)
      fx.slowmo(0.32, 0.8)
      fx.caption('STRUCTURAL COLLAPSE')
      fx.hit({ damage: 14, knockback: { x: 0, y: 0 }, hitStun: 80 })
      fx.ragdoll(fx.foe, [lane.dx * 2, -2, lane.dz * 2]) // crumple UNDER the drum
      blood(fx, 'blood', v3(p.x, 0.5, p.z), { n: 18, dirX: lane.dx })
      fx.particles('impact', v3(p.x, 0.6, p.z), { n: 14 })
    })

    // ...and keep rolling right over them
    tween(stage, roller, lane.exit, 74, 118, { ease: easeOut })
    fx.after(90, () => { fx.sfx('slide'); fx.particles('dust', v3(p.x, 0.2, p.z), { n: 6 }) })

    // what's left: one (1) freshly minted commemorative coin
    let coin = null
    fx.after(112, () => {
      camBeat(fx, 'hold') // settle wide on the freshly minted remains
      coin = fx.spawnProp('coin', v3(p.x, 0.35, p.z), { size: [1.5, 0.16], mass: 6 })
      fx.sfx('coin', { pitch: 0.6 })
      fx.coins(v3(p.x, 0.8, p.z), 18)
      fx.caption('NEW TOKEN MINTED')
      fx.announcer('STRUCTURAL COLLAPSE')
    })

    // reverse beeps out of frame
    for (let i = 0; i < 4; i++) fx.after(140 + i * 12, () => fx.sfx('coin', { pitch: 2.2, vol: 0.4 }))
    tween(stage, roller, lane.enter, 142, 200, { ease: smooth })

    // final ejection — the coin (and its former owner) get delisted
    fx.after(176, () => {
      const d = openDir(fx)
      fx.sfx('launch')
      fx.shake(0.9)
      fx.ragdoll(fx.foe, [d.x * 15, 17, d.z * 15])
      if (coin) { try { fx.impulse(coin, [d.x * 10, 14, d.z * 10], 4) } catch { /* prop gone */ } }
      fx.particles('stars', v3(p.x, 1.2, p.z), { n: 8 })
      fx.caption('DELISTED')
    })

    fx.after(226, end)
    fx.after(246, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// 2. LIQUIDATION TRUCK — the truck arrives, and it takes everything
// ---------------------------------------------------------------------------
function buildTruck() {
  const g = new THREE.Group()
  const cab = bx(1.3, 1.3, 1.7, 0xff4d5e)
  cab.position.set(1.7, 1.25, 0)
  g.add(cab)
  const glass = bx(0.2, 0.55, 1.4, 0x9fd8ff)
  glass.position.set(2.25, 1.5, 0)
  g.add(glass)
  const grill = bx(0.15, 0.5, 1.5, 0x2a2e38)
  grill.position.set(2.4, 0.75, 0)
  g.add(grill)
  const cargo = bx(3.2, 2.0, 1.8, 0xe8ecf2)
  cargo.position.set(-0.6, 1.6, 0)
  g.add(cargo)
  const stripe = bx(3.24, 0.42, 1.84, 0xff4d5e)
  stripe.position.set(-0.6, 1.6, 0)
  g.add(stripe)
  const lampL = bx(0.12, 0.18, 0.3, 0xfff3b0)
  lampL.position.set(2.42, 1.05, 0.55)
  const lampR = lampL.clone()
  lampR.position.z = -0.55
  g.add(lampL); g.add(lampR)
  for (const [x, z] of [[1.6, 0.85], [1.6, -0.85], [-0.4, 0.85], [-0.4, -0.85], [-1.6, 0.85], [-1.6, -0.85]]) {
    const w = cyl(0.42, 0.42, 0.26, 0x22242c, 8)
    w.rotation.x = Math.PI / 2
    w.position.set(x, 0.42, z)
    g.add(w)
  }
  return g
}

const LiquidationTruck = {
  id: 'liquidation-truck',
  name: 'LIQUIDATION TRUCK',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const lane = laneThrough(fx, 8.5, 6.5)
    const p = anchor(fx)

    fx.slowmo(0.5, 0.7)
    fx.zoom(fx.foe, 0.7)
    fx.caption('MARGIN CALL')
    fx.sfx('train_horn')
    fx.shake(0.3)
    playFoe(fx, 'hitHeavy')

    camBeat(fx, 'push') // low angle on the victim, headlights incoming

    const truck = buildTruck()
    truck.rotation.y = lane.yaw
    addMesh(stage, truck, lane.enter)
    fx.after(14, () => { fx.sfx('train_horn', { pitch: 0.8 }); fx.shake(0.4) })
    // marquee stretch: hang in the headlights before the grill connects
    fx.after(48, () => fx.slowmo(0.35, 0.9))

    // full send
    tween(stage, truck, lane.hit, 22, 58, { ease: easeIn })
    for (let i = 0; i < 4; i++) {
      fx.after(26 + i * 8, () => fx.particles('dust', v3(truck.position.x, 0.2, truck.position.z), { n: 5 }))
    }

    // IMPACT — swept clean off the books
    fx.after(58, () => {
      camBeat(fx, 'orbit')
      fx.sfx('break'); fx.sfx('punch_heavy')
      fx.shake(1.4)
      fx.slowmo(0.3, 0.9)
      fx.caption('LIQUIDATED')
      fx.hit({ damage: 16, knockback: { x: 0, y: 0 }, hitStun: 80 })
      fx.ragdoll(fx.foe, [lane.dx * 20, 8, lane.dz * 20])
      blood(fx, 'blood_spray', v3(p.x, 1.1, p.z), { n: 12, dir: { x: lane.dx, y: 0.5, z: lane.dz } })
      fx.particles('impact', v3(p.x, 1.1, p.z), { n: 16 })
      fx.particles('confetti', v3(p.x, 1.6, p.z), { n: 18 }) // your paperwork, sir
    })
    // carried on the grill for a beat
    fx.after(66, () => fx.impulse(fx.foe, [lane.dx * 6, 1, lane.dz * 6]))
    fx.after(74, () => fx.impulse(fx.foe, [lane.dx * 5, 1, lane.dz * 5]))

    // truck piles into the far wall
    tween(stage, truck, lane.exit, 58, 96, { ease: easeOut })
    fx.after(96, () => {
      camBeat(fx, 'hold') // wide on the wreck and the paperwork
      fx.sfx('thud'); fx.sfx('break')
      fx.shake(1.0)
      truck.rotation.z += 0.12 // crumpled nose-down
      fx.particles('sparks', v3(lane.exit.x + lane.dx, 1.2, lane.exit.z + lane.dz), { n: 16 })
      fx.particles('smoke', v3(lane.exit.x, 1.8, lane.exit.z), { n: 8 })
      fx.coins(v3(lane.exit.x, 1.5, lane.exit.z), 14)
    })
    fx.after(120, () => fx.announcer('POSITION CLOSED'))
    fx.after(150, () => fx.caption('BALANCE: ZERO'))

    // reverse out, beeping, like nothing happened
    for (let i = 0; i < 4; i++) fx.after(160 + i * 12, () => fx.sfx('coin', { pitch: 2.4, vol: 0.35 }))
    tween(stage, truck, lane.enter, 162, 214, { ease: smooth })

    fx.after(218, end)
    fx.after(238, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// 3. ORBITAL CANDLE STRIKE — support was called in. From space.
// ---------------------------------------------------------------------------
const OrbitalCandleStrike = {
  id: 'orbital-candle-strike',
  name: 'ORBITAL CANDLE STRIKE',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)

    fx.slowmo(0.5, 0.8)
    fx.zoom(fx.foe, 0.8)
    fx.caption('ORBITAL STRIKE AUTHORIZED')
    fx.sfx('surge')
    playFoe(fx, 'knockdown')

    // targeting reticle spins down onto the victim
    const reticle = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.08, 6, 18),
      mat(0x37e07a, { transparent: true, opacity: 0.85 })
    )
    reticle.rotation.x = -Math.PI / 2
    addMesh(stage, reticle, v3(p.x, 2.6, p.z))
    spin(stage, reticle, 'z', 0.18)
    tween(stage, reticle, v3(p.x, 0.12, p.z), 4, 44, { ease: easeOut })
    for (let i = 0; i < 3; i++) fx.after(14 + i * 12, () => fx.sfx('coin', { pitch: 1.6 + i * 0.3, vol: 0.4 }))

    // the beam
    const beam = bx(0.9, 16, 0.9, 0x37e07a, { transparent: true, opacity: 0.5 })
    fx.after(48, () => {
      camBeat(fx, 'push') // low angle up the beam
      addMesh(stage, beam, v3(p.x, 8, p.z))
      fx.sfx('geyser')
      fx.shake(0.5)
      fx.caption('GREEN CANDLES INBOUND')
    })

    // candle rain — escalating bracketing shots around the victim
    for (let i = 0; i < 6; i++) {
      fx.after(56 + i * 11, () => {
        const a = (i / 6) * Math.PI * 2 + 0.7
        const r = 1.9 - i * 0.25 // walking the shots in
        const cpos = v3(clampX(fx, p.x + Math.cos(a) * r), 7 + Math.random() * 2, clampZ(fx, p.z + Math.sin(a) * r))
        fx.spawnProp('candle', cpos, { color: 0x37e07a, velocity: [0, -26, 0], mass: 3 })
        fx.after(9, () => {
          fx.shake(0.4 + i * 0.06)
          fx.sfx('thud', { pitch: 1.1 - i * 0.06 })
          fx.particles('sparks', v3(cpos.x, 0.4, cpos.z), { n: 8 })
          fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 40 })
        })
      })
    }

    // THE mega candle
    fx.after(128, () => {
      fx.slowmo(0.3, 0.9)
      fx.zoom(fx.foe, 0.9)
      fx.spawnProp('candle', v3(p.x, 11, p.z), { color: 0x37e07a, size: [1.15, 4.4, 1.15], mass: 26, velocity: [0, -30, 0] })
      fx.sfx('whoosh', { pitch: 0.6 })
    })
    fx.after(146, () => {
      camBeat(fx, 'orbit')
      fx.sfx('explosion')
      fx.shake(1.5)
      fx.caption('BULLISH IMPACT')
      fx.particles('explosion', v3(p.x, 0.8, p.z), { n: 30 })
      blood(fx, 'blood_fountain', v3(p.x, 0.5, p.z), { n: 10 })
      fx.hit({ damage: 18, knockback: { x: 0, y: 0 }, hitStun: 60 })
      const d = openDir(fx)
      fx.ragdoll(fx.foe, [d.x * 7, 24, d.z * 7]) // up only
      fx.coins(v3(p.x, 1.5, p.z), 24)
    })
    fx.after(170, () => fx.announcer('CANDLES ONLY GO UP'))
    fx.after(196, () => { camBeat(fx, 'hold'); fx.caption('UP ONLY') })

    // beam retracts skyward
    tween(stage, beam, v3(p.x, 26, p.z), 156, 196, { ease: easeIn })

    fx.after(232, end)
    fx.after(252, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// 4. HAND OF THE MARKET — the invisible hand becomes briefly visible
// ---------------------------------------------------------------------------
function buildHand() {
  const g = new THREE.Group()
  const palm = bx(2.2, 0.7, 2.4, 0xffcf3f)
  g.add(palm)
  const fingers = []
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group()
    const seg = bx(1.6, 0.5, 0.5, 0xffcf3f)
    seg.position.x = 0.8
    f.add(seg)
    f.position.set(1.1, 0, -0.9 + i * 0.6)
    g.add(f)
    fingers.push(f)
  }
  const thumb = bx(1.1, 0.5, 0.5, 0xffcf3f)
  thumb.position.set(0.4, 0, 1.45)
  thumb.rotation.y = -0.7
  g.add(thumb)
  const cuff = bx(0.8, 1.1, 2.6, 0x2a4d8f) // a tasteful suit cuff
  cuff.position.set(-1.4, 0, 0)
  g.add(cuff)
  return { g, flick: fingers[1] } // index-adjacent finger does the deed
}

const HandOfTheMarket = {
  id: 'hand-of-the-market',
  name: 'HAND OF THE MARKET',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.45, 0.9)
    fx.sfx('gong')
    fx.caption('THE INVISIBLE HAND')
    fx.shake(0.25)
    playFoe(fx, 'knockdown')

    const { g: hand, flick } = buildHand()
    hand.rotation.y = Math.atan2(-d.z, d.x) // flick travels into open space
    addMesh(stage, hand, v3(p.x - d.x * 1.6, 11, p.z - d.z * 1.6))
    tween(stage, hand, v3(p.x - d.x * 1.6, 2.1, p.z - d.z * 1.6), 8, 66, { ease: smooth })
    fx.after(12, () => fx.sfx('drone_hum'))
    fx.after(66, () => { fx.shake(0.4); fx.particles('dust', v3(p.x, 0.3, p.z), { n: 8 }) })

    // the wind-up. hold. hoooold.
    fx.after(84, () => {
      camBeat(fx, 'push') // low angle under the cocked finger
      fx.caption('PRICE DISCOVERY...')
      fx.zoom(fx.foe, 0.8)
    })
    // marquee stretch: the last instants before the SNAP crawl
    fx.after(104, () => fx.slowmo(0.35, 0.8))
    const flickT0 = fx.age || 0 // script-relative clock (echo beat may delay us)
    fx.frame((rawAge) => {
      const age = rawAge - flickT0
      if (age >= 84 && age < 112) flick.rotation.z = Math.min(1.1, (age - 84) * 0.045)
      else if (age >= 112 && age < 118) flick.rotation.z = 1.1 - (age - 112) * 0.36 // SNAP
      else if (age >= 118) flick.rotation.z = -1.06 + Math.min(1.06, (age - 118) * 0.02)
    })

    // FLICK
    fx.after(112, () => {
      camBeat(fx, 'orbit')
      fx.sfx('crack'); fx.sfx('launch')
      fx.shake(1.2)
      fx.slowmo(0.3, 1.0)
      fx.caption('CORRECTION')
      fx.hit({ damage: 15, knockback: { x: 0, y: 0 }, hitStun: 70 })
      fx.ragdoll(fx.foe, [d.x * 11, 32, d.z * 11]) // into orbit
      fx.particles('impact', v3(p.x, 1.2, p.z), { n: 12 })
      blood(fx, 'blood', v3(p.x, 1.4, p.z), { n: 10, dirX: d.x })
    })
    // star trail chases the ragdoll live
    for (let i = 0; i < 5; i++) {
      fx.after(118 + i * 7, () => {
        const fp = fx.foe.pos
        fx.particles('stars', v3(fp.x, (fp.y || 1) + 0.4, fp.z || 0), { n: 4 })
        if (i === 2) fx.sfx('whoosh', { pitch: 1.5 })
      })
    }
    fx.after(150, () => fx.announcer('FLICKED INTO ORBIT'))

    // dusts itself off, tips a few coins, ascends
    fx.after(172, () => { camBeat(fx, 'hold'); hand.rotation.z = 0.16; fx.sfx('coin', { pitch: 1.2 }) })
    fx.after(180, () => { hand.rotation.z = -0.12; fx.coins(v3(p.x, 2.4, p.z), 10) })
    fx.after(188, () => { hand.rotation.z = 0 })
    fx.after(200, () => fx.caption('EFFICIENT MARKETS'))
    tween(stage, hand, v3(p.x - d.x * 1.6, 14, p.z - d.z * 1.6), 196, 236, { ease: easeIn })

    fx.after(240, end)
    fx.after(258, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// 5. BEAR RAID — the bears were real and they were friends all along. Not yours.
// ---------------------------------------------------------------------------
function buildBear(scale = 1) {
  const g = new THREE.Group()
  const body = bx(1.5, 0.9, 0.8, 0x6b4a2b)
  body.position.y = 0.85
  g.add(body)
  const head = bx(0.6, 0.55, 0.6, 0x6b4a2b)
  head.position.set(0.95, 1.25, 0)
  g.add(head)
  const snout = bx(0.25, 0.25, 0.3, 0x9c7a4d)
  snout.position.set(1.32, 1.15, 0)
  g.add(snout)
  for (const s of [1, -1]) {
    const ear = bx(0.18, 0.18, 0.12, 0x4d3620)
    ear.position.set(0.85, 1.6, s * 0.22)
    g.add(ear)
  }
  const legs = []
  for (const [x, z] of [[0.55, 0.3], [0.55, -0.3], [-0.55, 0.3], [-0.55, -0.3]]) {
    const leg = bx(0.28, 0.6, 0.28, 0x4d3620)
    leg.position.set(x, 0.35, z)
    g.add(leg)
    legs.push(leg)
  }
  g.scale.setScalar(scale)
  return { g, legs }
}

const BearRaid = {
  id: 'bear-raid',
  name: 'BEAR RAID',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const lane = laneThrough(fx, 8, 7)
    const p = anchor(fx)

    fx.slowmo(0.5, 0.7)
    fx.caption('BEAR RAID')
    fx.sfx('gong')
    playFoe(fx, 'knockdown')

    camBeat(fx, 'push') // low on the victim while the ground rumbles

    // the ground starts to rumble
    for (let i = 0; i < 5; i++) {
      fx.after(6 + i * 8, () => {
        fx.shake(0.2 + i * 0.1)
        fx.sfx('thud', { pitch: 0.6 + i * 0.05, vol: 0.5 })
        fx.particles('dust', v3(lane.enter.x, 0.25, lane.enter.z), { n: 5 })
      })
    }

    // the herd — staggered lanes, staggered arrival
    const bearPlan = [
      { at: 30, off: 0.9, sc: 1.0 }, { at: 48, off: -1.0, sc: 1.05 },
      { at: 66, off: 0.4, sc: 0.95 }, { at: 84, off: -0.4, sc: 1.1 },
    ]
    for (const [i, bp] of bearPlan.entries()) {
      const { g: bear, legs } = buildBear(bp.sc)
      bear.rotation.y = lane.yaw
      // perpendicular offset so the stampede has width
      const px = -lane.dz * bp.off, pz = lane.dx * bp.off
      addMesh(stage, bear, v3(clampX(fx, lane.enter.x + px), 0, clampZ(fx, lane.enter.z + pz)))
      bob(stage, bear, 0.22, 0.55, bp.at - 20, bp.at + 60)
      for (const [j, leg] of legs.entries()) spin(stage, leg, 'z', j % 2 ? 0.3 : -0.3, bp.at - 20, bp.at + 40)
      tween(stage, bear, v3(clampX(fx, lane.exit.x + px), 0, clampZ(fx, lane.exit.z + pz)), bp.at - 20, bp.at + 34, { ease: easeIn })
      // trample as each one crosses the victim
      fx.after(bp.at, () => {
        fx.shake(0.7 + i * 0.1)
        fx.sfx('thud', { pitch: 0.9 + i * 0.1 })
        fx.hit({ damage: 4, knockback: { x: 0, y: 0 }, hitStun: 50 })
        fx.impulse(fx.foe, [lane.dx * 2, 4, lane.dz * 2], 1)
        blood(fx, 'blood', v3(p.x, 0.6, p.z), { n: 8, dirX: lane.dx })
        fx.particles('dust', v3(p.x, 0.3, p.z), { n: 7 })
      })
    }
    fx.after(60, () => fx.caption('SELL PRESSURE'))

    // the big one
    fx.after(104, () => { fx.slowmo(0.32, 0.9); fx.zoom(fx.foe, 0.9); fx.sfx('moo', { pitch: 0.5 }) })
    const { g: boss, legs: bossLegs } = buildBear(1.7)
    boss.rotation.y = lane.yaw
    addMesh(stage, boss, lane.enter)
    bob(stage, boss, 0.3, 0.5, 104, 176)
    for (const [j, leg] of bossLegs.entries()) spin(stage, leg, 'z', j % 2 ? 0.26 : -0.26, 104, 160)
    tween(stage, boss, lane.hit, 104, 138, { ease: easeIn })

    // the punt
    fx.after(138, () => {
      camBeat(fx, 'orbit')
      fx.sfx('break'); fx.sfx('launch')
      fx.shake(1.4)
      fx.caption('MAULED')
      fx.hit({ damage: 14, knockback: { x: 0, y: 0 }, hitStun: 70 })
      fx.ragdoll(fx.foe, [lane.dx * 19, 13, lane.dz * 19])
      blood(fx, 'blood_spray', v3(p.x, 1.0, p.z), { n: 12, dir: { x: lane.dx, y: 0.6, z: lane.dz } })
      fx.particles('impact', v3(p.x, 1.0, p.z), { n: 14 })
    })
    tween(stage, boss, lane.exit, 144, 176, { ease: easeOut })
    fx.after(158, () => fx.announcer('THE BEARS ARE IN CONTROL'))
    fx.after(190, () => { camBeat(fx, 'hold'); fx.caption('MARKET MAULED') })

    fx.after(224, end)
    fx.after(244, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// 6. ETF VACUUM — instant diversification. You are now 2% of everything.
// ---------------------------------------------------------------------------
function buildVacuum() {
  const g = new THREE.Group()
  const can = cyl(1.1, 1.3, 2.6, 0xe8ecf2, 10)
  can.position.y = 1.6
  g.add(can)
  const lid = cyl(1.15, 1.15, 0.3, 0x2a4d8f, 10)
  lid.position.y = 3.0
  g.add(lid)
  // index-fund livery: a ring of colored holdings squares
  const cols = [0xff4d5e, 0x37e07a, 0xffcf3f, 0x9fd8ff, 0xb07af0, 0xff9d3f]
  for (let i = 0; i < 6; i++) {
    const sq = bx(0.3, 0.3, 0.06, cols[i])
    const a = (i / 6) * Math.PI * 2
    sq.position.set(Math.cos(a) * 1.22, 1.7, Math.sin(a) * 1.22)
    sq.rotation.y = -a + Math.PI / 2
    g.add(sq)
  }
  const nozzle = new THREE.Group()
  const tube = cyl(0.34, 0.45, 2.2, 0x8a93a6, 8)
  tube.rotation.z = Math.PI / 2
  tube.position.x = 1.1
  nozzle.add(tube)
  const mouth = cyl(0.6, 0.45, 0.5, 0x444a58, 8)
  mouth.rotation.z = Math.PI / 2
  mouth.position.x = 2.3
  nozzle.add(mouth)
  nozzle.position.set(1.0, 0.9, 0)
  g.add(nozzle)
  return { g, can }
}

const EtfVacuum = {
  id: 'etf-vacuum',
  name: 'ETF VACUUM',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)
    // vacuum parks in open space, nozzle (its +X) pointing back at the victim
    const vpos = v3(clampX(fx, p.x + d.x * 4.2, 1.4), 0, clampZ(fx, p.z + d.z * 4.2, 1.4))
    const nozzleTip = v3(vpos.x - d.x * 2.4, 0.9, vpos.z - d.z * 2.4)

    fx.slowmo(0.5, 0.8)
    fx.caption('DIVERSIFICATION EVENT')
    fx.sfx('drone_hum')
    playFoe(fx, 'launched')

    const { g: vac, can } = buildVacuum()
    vac.rotation.y = Math.atan2(d.z, -d.x) // nozzle toward victim
    addMesh(stage, vac, v3(vpos.x, 12, vpos.z))
    tween(stage, vac, vpos, 6, 52, { ease: smooth })
    fx.after(52, () => { fx.shake(0.5); fx.sfx('thud'); fx.particles('dust', v3(vpos.x, 0.3, vpos.z), { n: 8 }) })

    // SUCTION
    fx.after(64, () => { camBeat(fx, 'push'); fx.caption('INITIATING SUCTION'); fx.sfx('surge') })
    for (let i = 0; i < 9; i++) {
      fx.after(68 + i * 6, () => {
        const fp = fx.foe.pos
        const dx = nozzleTip.x - fp.x, dz = nozzleTip.z - (fp.z || 0)
        const len = Math.max(0.001, Math.hypot(dx, dz))
        fx.impulse(fx.foe, [(dx / len) * 5.5, 1.2, (dz / len) * 5.5], 0.6)
        fx.sfx('whoosh', { pitch: 0.8 + i * 0.07, vol: 0.5 })
        fx.particles('dust', v3(fp.x, 1.0, fp.z || 0), { n: 4, dirX: Math.sign(dx) || 1 })
        if (i % 3 === 0) fx.coins(v3(nozzleTip.x, nozzleTip.y, nozzleTip.z), 5)
      })
    }

    // GULP — then the canister gets indigestion
    fx.after(124, () => {
      fx.sfx('boing')
      fx.zoom(fx.foe, 0.7)
      fx.ragdoll(fx.foe, [d.x * 6, 2, d.z * 6]) // slurped into the mouth
      fx.shake(0.7)
    })
    for (let i = 0; i < 5; i++) {
      fx.after(134 + i * 7, () => {
        can.scale.setScalar(1 + (i % 2 ? 0.1 : -0.06))
        fx.shake(0.4)
        fx.sfx('thud', { pitch: 1.3 + i * 0.1, vol: 0.5 })
      })
    }
    fx.after(168, () => can.scale.setScalar(1))

    // output: neatly labeled holdings cubes
    fx.after(170, () => fx.caption('FULLY DIVERSIFIED'))
    const cubeCols = [0xff4d5e, 0x37e07a, 0xffcf3f, 0x9fd8ff, 0xb07af0, 0xff9d3f, 0xe8ecf2, 0x6b4a2b]
    for (let i = 0; i < 8; i++) {
      fx.after(172 + i * 3, () => {
        const cube = fx.spawnProp('box', v3(vpos.x, 3.3, vpos.z), { size: [0.32, 0.32, 0.32], color: cubeCols[i], mass: 0.3 })
        if (cube) {
          try { fx.impulse(cube, [-d.x * (2 + Math.random() * 4), 6 + Math.random() * 4, -d.z * (2 + Math.random() * 4) + (Math.random() - 0.5) * 4], 3) } catch { /* prop gone */ }
        }
        fx.sfx('coin', { pitch: 1.4 + i * 0.1, vol: 0.5 })
      })
    }

    // exhaust ejection out the back
    fx.after(206, () => {
      camBeat(fx, 'orbit')
      fx.sfx('explosion')
      fx.shake(1.2)
      fx.slowmo(0.35, 0.8)
      fx.caption('REBALANCED')
      fx.hit({ damage: 12, knockback: { x: 0, y: 0 }, hitStun: 60 })
      fx.ragdoll(fx.foe, [-d.x * 17, 15, -d.z * 17])
      blood(fx, 'blood', v3(vpos.x, 1.6, vpos.z), { n: 8, dirX: -d.x })
      fx.particles('smoke', v3(vpos.x - d.x, 1.4, vpos.z - d.z), { n: 10 })
      fx.coins(v3(vpos.x, 2, vpos.z), 12)
    })
    fx.after(226, () => { camBeat(fx, 'hold'); fx.announcer('FULLY DIVERSIFIED') })
    tween(stage, vac, v3(vpos.x, 13, vpos.z), 236, 272, { ease: easeIn })

    fx.after(276, end)
    fx.after(294, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// 7. FINAL AUDIT — every receipt you ever lost, returned at terminal velocity
// ---------------------------------------------------------------------------
function buildStamp() {
  const g = new THREE.Group()
  const base = bx(1.9, 0.55, 1.3, 0xff4d5e)
  base.position.y = 0.28
  g.add(base)
  const neck = cyl(0.18, 0.22, 0.9, 0x8a5a2b, 8)
  neck.position.y = 1.0
  g.add(neck)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), mat(0x8a5a2b))
  knob.position.y = 1.6
  g.add(knob)
  return g
}

const FinalAudit = {
  id: 'final-audit',
  name: 'FINAL AUDIT',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)

    fx.slowmo(0.5, 0.8)
    fx.caption('THE FINAL AUDIT')
    fx.sfx('gong')
    playFoe(fx, 'knockdown')

    // paper avalanche — thin white sheets fluttering down in waves
    const papers = []
    for (let i = 0; i < 16; i++) {
      fx.after(12 + i * 5, () => {
        const sheet = fx.spawnProp('box', v3(
          clampX(fx, p.x + (Math.random() - 0.5) * 3.4),
          4.5 + Math.random() * 2,
          clampZ(fx, p.z + (Math.random() - 0.5) * 3.4)
        ), { size: [0.55, 0.03, 0.75], color: 0xf2f4f8, mass: 0.06 })
        if (sheet) papers.push(sheet)
        if (i % 4 === 0) fx.sfx('slide', { pitch: 1.5 + (i / 16) * 0.5, vol: 0.4 })
        if (i % 5 === 2) fx.hit({ damage: 1, knockback: { x: 0, y: 0 }, hitStun: 30 })
      })
    }
    fx.after(58, () => fx.caption('RECEIPTS LOCATED'))
    // office furniture joins the proceedings
    fx.after(96, () => {
      fx.spawnProp('monitor', v3(clampX(fx, p.x + 0.9), 5, clampZ(fx, p.z - 0.5)), { velocity: [0, -14, 0] })
      fx.spawnProp('crate', v3(clampX(fx, p.x - 0.8), 5.6, clampZ(fx, p.z + 0.6)), { velocity: [0, -14, 0] })
      fx.sfx('whoosh', { pitch: 0.8 })
    })
    fx.after(106, () => { fx.sfx('thud'); fx.shake(0.6) })

    // the DENIED stamp
    const stamp = buildStamp()
    fx.after(118, () => {
      camBeat(fx, 'push') // low under the descending verdict
      addMesh(stage, stamp, v3(p.x, 12, p.z))
      fx.slowmo(0.3, 0.9)
      fx.zoom(fx.foe, 0.9)
      fx.sfx('klaxon', { pitch: 0.7 })
    })
    tween(stage, stamp, v3(p.x, 0, p.z), 122, 140, { ease: easeIn })

    // SLAM
    const ink = bx(1.7, 0.02, 1.15, 0x8f1622)
    fx.after(140, () => {
      camBeat(fx, 'orbit')
      fx.sfx('break'); fx.sfx('thud')
      fx.shake(1.5)
      fx.caption('AUDITED')
      fx.hit({ damage: 16, knockback: { x: 0, y: 0 }, hitStun: 70 })
      blood(fx, 'blood', v3(p.x, 0.4, p.z), { n: 14 })
      fx.particles('impact', v3(p.x, 0.6, p.z), { n: 16 })
      addMesh(stage, ink, v3(p.x, 0.03, p.z)) // permanent record (until cleanup)
    })
    tween(stage, stamp, v3(p.x, 8, p.z), 158, 190, { ease: smooth })
    fx.after(166, () => fx.announcer('CLAIM DENIED'))

    // case closed: paperwork detonates, defendant is ejected
    fx.after(198, () => {
      camBeat(fx, 'hold') // wide on the settled paperwork
      const d = openDir(fx)
      fx.sfx('explosion')
      fx.shake(1.0)
      fx.caption('CASE CLOSED')
      for (const sheet of papers) {
        try { fx.impulse(sheet, [(Math.random() - 0.5) * 10, 5 + Math.random() * 5, (Math.random() - 0.5) * 10], 5) } catch { /* prop gone */ }
      }
      fx.ragdoll(fx.foe, [d.x * 16, 15, d.z * 16])
      fx.particles('confetti', v3(p.x, 1.5, p.z), { n: 20 })
      fx.coins(v3(p.x, 1.2, p.z), 10)
    })

    fx.after(234, end)
    fx.after(254, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// 8. THE RUG — it really tied the arena together
// ---------------------------------------------------------------------------
function buildRug() {
  const g = new THREE.Group()
  const body = bx(4.6, 0.07, 3.0, 0x8f1622)
  g.add(body)
  const border = bx(4.62, 0.075, 3.02, 0xffcf3f)
  border.scale.y = 0.6
  g.add(border)
  const inner = bx(3.6, 0.09, 2.2, 0x8f1622)
  g.add(inner)
  const medallion = cyl(0.7, 0.7, 0.1, 0xffcf3f, 8)
  medallion.position.y = 0.03
  g.add(medallion)
  for (const s of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const tassel = bx(0.28, 0.05, 0.34, 0xf2e7c8)
      tassel.position.set(s * 2.5, 0, -1.26 + i * 0.42)
      g.add(tassel)
    }
  }
  return g
}

const TheRug = {
  id: 'the-rug',
  name: 'THE RUG',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx) // yank direction — toward open space

    fx.slowmo(0.6, 0.8)
    fx.caption('NICE RUG.')
    fx.sfx('boing', { pitch: 0.7, vol: 0.5 })
    playFoe(fx, 'knockdown')

    // rug slides in underneath from open space
    const rug = buildRug()
    rug.rotation.y = Math.atan2(-d.z, d.x)
    addMesh(stage, rug, v3(clampX(fx, p.x + d.x * 9, -2), 0.05, clampZ(fx, p.z + d.z * 9, -2)))
    tween(stage, rug, v3(p.x, 0.05, p.z), 6, 40, { ease: smooth })
    fx.after(40, () => fx.sfx('slide', { pitch: 0.9 }))

    // the comfy beat
    fx.after(56, () => { fx.coins(v3(p.x, 1.4, p.z), 6); fx.sfx('coin', { pitch: 1.1, vol: 0.5 }) })
    fx.after(68, () => { camBeat(fx, 'push'); fx.caption('COMFY?') }) // in close and low. too comfy.
    fx.after(84, () => { fx.zoom(fx.foe, 0.8); fx.sfx('surge', { pitch: 0.6, vol: 0.5 }); fx.shake(0.2) })

    // YANK
    fx.after(96, () => {
      camBeat(fx, 'orbit')
      fx.sfx('whoosh', { pitch: 0.55 }); fx.sfx('crack')
      fx.shake(1.0)
      fx.slowmo(0.3, 0.9)
      fx.caption('RUGGED')
      fx.hit({ damage: 10, knockback: { x: 0, y: 0 }, hitStun: 60 })
      // feet go with the rug, body goes up: backflip launch AWAY from the yank
      fx.ragdoll(fx.foe, [-d.x * 6, 13, -d.z * 6])
      fx.particles('dust', v3(p.x, 0.3, p.z), { n: 12, dirX: d.x })
    })
    tween(stage, rug, v3(clampX(fx, p.x + d.x * 11, -3), 0.05, clampZ(fx, p.z + d.z * 11, -3)), 96, 108, { ease: easeIn })

    // hang time
    fx.after(112, () => {
      const fp = fx.foe.pos
      fx.particles('stars', v3(fp.x, (fp.y || 1) + 0.5, fp.z || 0), { n: 6 })
      fx.sfx('boing', { pitch: 1.3 })
    })
    fx.after(132, () => {
      const fp = fx.foe.pos
      fx.sfx('thud'); fx.shake(0.8)
      blood(fx, 'blood', v3(fp.x, 0.4, fp.z || 0), { n: 8 })
      fx.particles('dust', v3(fp.x, 0.25, fp.z || 0), { n: 8 })
    })
    fx.after(150, () => { camBeat(fx, 'hold'); fx.announcer('TOTAL RUG PULL'); fx.caption('LIQUIDITY: GONE') })

    // encore: the rug rolls itself up and returns as a bat
    const roll = cyl(0.5, 0.5, 3.0, 0x8f1622, 8)
    roll.rotation.x = Math.PI / 2
    roll.rotation.y = Math.atan2(-d.z, d.x)
    fx.after(166, () => {
      addMesh(stage, roll, v3(clampX(fx, p.x + d.x * 9, -2), 1.1, clampZ(fx, p.z + d.z * 9, -2)))
      fx.sfx('whoosh', { pitch: 0.8 })
    })
    tween(stage, roll, v3(p.x, 1.1, p.z), 168, 184, { ease: easeIn })
    fx.after(184, () => {
      fx.sfx('punch_heavy'); fx.sfx('launch')
      fx.shake(1.2)
      fx.caption('AND STAY OUT')
      fx.hit({ damage: 12, knockback: { x: 0, y: 0 }, hitStun: 60 })
      fx.ragdoll(fx.foe, [d.x * 21, 14, d.z * 21])
      fx.particles('impact', v3(p.x, 1.1, p.z), { n: 12 })
      blood(fx, 'blood_spray', v3(p.x, 1.2, p.z), { n: 10, dir: { x: d.x, y: 0.5, z: d.z } })
    })
    tween(stage, roll, v3(clampX(fx, p.x - d.x * 9, -2), 1.1, clampZ(fx, p.z - d.z * 9, -2)), 186, 206, { ease: easeOut })

    fx.after(216, end)
    fx.after(236, () => cleanupStage(stage))
  },
}

// ===========================================================================
// BASIC tier (§23) — quick 2-3s light-KO flourishes
// ===========================================================================

// ---------------------------------------------------------------------------
// B1. UPPERCUT ORBIT — victim pops up, one slow orbit beat, crashes
// ---------------------------------------------------------------------------
const UppercutOrbit = {
  id: 'uppercut-orbit',
  name: 'UPPERCUT ORBIT',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.5, 0.5)
    fx.caption('GOING UP')
    fx.sfx('punch_heavy')
    playSelf(fx, 'taunt')
    playFoe(fx, 'launched')
    camBeat(fx, 'push')

    // the pop
    fx.after(6, () => {
      fx.sfx('launch')
      fx.shake(0.7)
      fx.hit({ damage: 6, knockback: { x: 0, y: 0 }, hitStun: 60 })
      fx.ragdoll(fx.foe, [d.x * 3, 19, d.z * 3])
      fx.particles('impact', v3(p.x, 1.3, p.z), { n: 10 })
      blood(fx, 'blood', v3(p.x, 1.5, p.z), { n: 8 })
    })

    // one slow orbit beat at apex
    fx.after(24, () => {
      camBeat(fx, 'orbit')
      fx.slowmo(0.25, 1.1)
      fx.zoom(fx.foe, 0.9)
      fx.caption('PEAK VALUATION')
    })
    for (let i = 0; i < 4; i++) {
      fx.after(30 + i * 12, () => {
        const fp = fx.foe.pos
        fx.particles('stars', v3(fp.x, (fp.y || 1) + 0.4, fp.z || 0), { n: 4 })
        if (i === 1) fx.sfx('whoosh', { pitch: 1.4, vol: 0.5 })
      })
    }

    // re-entry
    fx.after(92, () => {
      const fp = fx.foe.pos
      fx.sfx('thud'); fx.sfx('break')
      fx.shake(1.1)
      fx.caption('RE-ENTRY')
      blood(fx, 'blood', v3(fp.x, 0.4, fp.z || 0), { n: 10 })
      fx.particles('dust', v3(fp.x, 0.25, fp.z || 0), { n: 10 })
    })
    fx.after(108, () => { camBeat(fx, 'hold'); fx.announcer('DOWN ONLY') })

    fx.after(146, end)
    fx.after(160, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// B2. COIN SHOWER SLAM — one stomp, and the floor pays out
// ---------------------------------------------------------------------------
const CoinShowerSlam = {
  id: 'coin-shower-slam',
  name: 'COIN SHOWER SLAM',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.5, 0.5)
    fx.caption('JACKPOT STOMP')
    playSelf(fx, 'taunt')
    playFoe(fx, 'knockdown')
    camBeat(fx, 'push')

    // the stomp
    fx.after(8, () => {
      fx.sfx('thud'); fx.sfx('crack')
      fx.shake(0.9)
      fx.particles('dust', v3(p.x, 0.25, p.z), { n: 10 })
      fx.hit({ damage: 5, knockback: { x: 0, y: 0 }, hitStun: 50 })
    })

    // coin geyser erupts under the victim
    fx.after(16, () => {
      camBeat(fx, 'orbit')
      fx.sfx('geyser'); fx.sfx('coins_burst')
      fx.shake(0.8)
      fx.caption('PAYOUT')
      fx.ragdoll(fx.foe, [d.x * 3, 15, d.z * 3])
      blood(fx, 'blood', v3(p.x, 1.0, p.z), { n: 6 })
    })
    for (let i = 0; i < 6; i++) {
      fx.after(20 + i * 9, () => {
        fx.coins(v3(p.x, 0.6 + i * 0.3, p.z), 8)
        fx.sfx('coin', { pitch: 1.1 + i * 0.12, vol: 0.5 })
      })
    }
    fx.after(56, () => { fx.slowmo(0.35, 0.7); fx.zoom(fx.foe, 0.7) })

    // the landing, into their own winnings
    fx.after(96, () => {
      const fp = fx.foe.pos
      fx.sfx('thud')
      fx.shake(0.9)
      fx.caption('CASHED OUT')
      fx.coins(v3(fp.x, 0.8, fp.z || 0), 10)
      blood(fx, 'blood', v3(fp.x, 0.4, fp.z || 0), { n: 8 })
      fx.particles('dust', v3(fp.x, 0.25, fp.z || 0), { n: 8 })
    })
    fx.after(112, () => { camBeat(fx, 'hold'); fx.announcer('PAID IN FULL') })

    fx.after(150, end)
    fx.after(164, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// B3. TICKER TAPE — wrapped in a price ribbon, spun, dropped
// ---------------------------------------------------------------------------
function buildRibbon() {
  const g = new THREE.Group()
  // helix of alternating green/red price segments
  for (let i = 0; i < 12; i++) {
    const seg = bx(0.9, 0.16, 0.05, i % 2 ? 0xff4d5e : 0x37e07a)
    const a = i * 0.9
    seg.position.set(Math.cos(a) * 0.85, 0.35 + i * 0.14, Math.sin(a) * 0.85)
    seg.rotation.y = -a
    g.add(seg)
  }
  return g
}

const TickerTape = {
  id: 'ticker-tape',
  name: 'TICKER TAPE',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.5, 0.6)
    fx.caption('PRICE ACTION')
    fx.sfx('slide', { pitch: 1.4 })
    playFoe(fx, 'launched')
    camBeat(fx, 'push')

    // the ribbon coils around them
    const ribbon = buildRibbon()
    addMesh(stage, ribbon, v3(p.x, 0, p.z))
    grow(stage, ribbon, 0.2, 1, 2, 14)
    spin(stage, ribbon, 'y', 0.3, 2, 96)
    fx.after(10, () => { fx.sfx('grab'); fx.shake(0.4) })

    // spun up like a bad chart
    for (let i = 0; i < 4; i++) {
      fx.after(18 + i * 12, () => {
        fx.impulse(fx.foe, [0, 2.2, 0], 2.5)
        fx.sfx('whoosh', { pitch: 1.0 + i * 0.15, vol: 0.5 })
        fx.particles('sparks', v3(p.x, 1.2 + i * 0.3, p.z), { n: 4 })
      })
    }
    tween(stage, ribbon, v3(p.x, 1.1, p.z), 18, 66, { ease: smooth })
    fx.after(64, () => { fx.slowmo(0.35, 0.7); fx.zoom(fx.foe, 0.8); fx.caption('WRAPPED POSITION') })

    // the ribbon whips away — victim unspools and drops
    fx.after(92, () => {
      camBeat(fx, 'orbit')
      fx.sfx('whoosh', { pitch: 0.6 }); fx.sfx('crack')
      fx.shake(0.9)
      fx.caption('CHART CRASH')
      fx.hit({ damage: 7, knockback: { x: 0, y: 0 }, hitStun: 60 })
      fx.ragdoll(fx.foe, [d.x * 5, 7, d.z * 5])
    })
    tween(stage, ribbon, v3(clampX(fx, p.x + d.x * 8, -2), 5, clampZ(fx, p.z + d.z * 8, -2)), 92, 112, { ease: easeIn })
    fx.after(118, () => {
      const fp = fx.foe.pos
      fx.sfx('thud'); fx.shake(0.8)
      blood(fx, 'blood', v3(fp.x, 0.4, fp.z || 0), { n: 8 })
      fx.particles('dust', v3(fp.x, 0.25, fp.z || 0), { n: 8 })
    })
    fx.after(132, () => { camBeat(fx, 'hold'); fx.announcer('READ THE TICKER') })

    fx.after(158, end)
    fx.after(172, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// B4. DUST OFF — attacker dusts hands; victim tumbles offscreen, bounces back
// ---------------------------------------------------------------------------
const DustOff = {
  id: 'dust-off',
  name: 'DUST OFF',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)
    const b = bounds(fx)
    // where the victim meets the wall
    const wall = v3(
      d.x ? (d.x > 0 ? b.maxX - 0.5 : b.minX + 0.5) : p.x,
      1.1,
      d.z ? (d.z > 0 ? b.maxZ - 0.5 : b.minZ + 0.5) : p.z
    )

    fx.slowmo(0.5, 0.5)
    fx.caption('TAKING OUT THE TRASH')
    fx.sfx('whoosh', { pitch: 0.8 })
    camBeat(fx, 'push')

    // the send-off
    fx.after(6, () => {
      fx.sfx('launch')
      fx.shake(0.8)
      fx.hit({ damage: 6, knockback: { x: 0, y: 0 }, hitStun: 60 })
      fx.ragdoll(fx.foe, [d.x * 22, 7, d.z * 22])
      playFoe(fx, 'launched')
      fx.particles('dust', v3(p.x, 0.5, p.z), { n: 8, dirX: d.x })
    })

    // attacker: hands. dusted. (brush-brush)
    fx.after(16, () => { playSelf(fx, 'taunt'); fx.zoom(fx.self, 0.5) })
    fx.after(22, () => fx.sfx('slide', { pitch: 1.8, vol: 0.45 }))
    fx.after(32, () => fx.sfx('slide', { pitch: 1.6, vol: 0.45 }))
    fx.after(26, () => fx.particles('dust', v3(selfPos(fx).x, 1.5, selfPos(fx).z), { n: 5 }))

    // wall clang offscreen
    fx.after(34, () => {
      fx.sfx('thud'); fx.sfx('boing', { pitch: 0.8 })
      fx.shake(1.0)
      fx.particles('sparks', wall, { n: 10 })
      blood(fx, 'blood', wall, { n: 6, dirX: -d.x })
      fx.caption('OUT OF BOUNDS')
    })

    // ...and the trash comes back
    fx.after(48, () => {
      camBeat(fx, 'orbit')
      fx.slowmo(0.35, 0.8)
      fx.impulse(fx.foe, [-d.x * 14, 7, -d.z * 14], 2)
      fx.sfx('boing', { pitch: 1.2 })
      fx.particles('stars', wall, { n: 6 })
    })
    fx.after(78, () => {
      const fp = fx.foe.pos
      fx.sfx('thud'); fx.shake(0.9)
      fx.caption('RETURN TO SENDER')
      blood(fx, 'blood', v3(fp.x, 0.4, fp.z || 0), { n: 8 })
      fx.particles('dust', v3(fp.x, 0.25, fp.z || 0), { n: 10 })
    })
    fx.after(96, () => { camBeat(fx, 'hold'); fx.announcer('NO REFUNDS') })

    fx.after(144, end)
    fx.after(158, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// B5. SELL SIGNAL — a giant red SELL arrow smacks them down
// ---------------------------------------------------------------------------
function buildSellArrow() {
  const g = new THREE.Group()
  // points DOWN: shaft on top, head (stepped boxes) tapering below
  const shaft = bx(0.7, 2.2, 0.7, 0xff4d5e)
  shaft.position.y = 2.6
  g.add(shaft)
  const head1 = bx(1.9, 0.5, 1.9, 0xff4d5e)
  head1.position.y = 1.25
  g.add(head1)
  const head2 = bx(1.2, 0.5, 1.2, 0xff4d5e)
  head2.position.y = 0.75
  g.add(head2)
  const tip = bx(0.55, 0.5, 0.55, 0x8f1622)
  tip.position.y = 0.25
  g.add(tip)
  return g
}

const SellSignal = {
  id: 'sell-signal',
  name: 'SELL SIGNAL',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.5, 0.6)
    fx.caption('SIGNAL CONFIRMED')
    fx.sfx('klaxon')
    playFoe(fx, 'knockdown')
    camBeat(fx, 'push')

    const arrow = buildSellArrow()
    addMesh(stage, arrow, v3(p.x, 9, p.z))
    fx.after(8, () => fx.sfx('surge', { pitch: 0.8, vol: 0.6 }))
    // slams straight down onto the victim
    tween(stage, arrow, v3(p.x, 0.1, p.z), 12, 40, { ease: easeIn })
    fx.after(34, () => fx.slowmo(0.35, 0.7)) // dread beat

    fx.after(40, () => {
      camBeat(fx, 'orbit')
      fx.sfx('break'); fx.sfx('thud')
      fx.shake(1.3)
      fx.caption('SOLD')
      fx.hit({ damage: 8, knockback: { x: 0, y: 0 }, hitStun: 60 })
      fx.ragdoll(fx.foe, [d.x * 3, -2, d.z * 3])
      blood(fx, 'blood', v3(p.x, 0.5, p.z), { n: 10 })
      fx.particles('impact', v3(p.x, 0.7, p.z), { n: 12 })
    })
    // arrow bounces once, satisfied
    tween(stage, arrow, v3(p.x, 1.2, p.z), 46, 56, { ease: easeOut })
    tween(stage, arrow, v3(p.x, 0.1, p.z), 56, 64, { ease: easeIn })
    fx.after(64, () => { fx.sfx('thud', { pitch: 1.2, vol: 0.5 }); fx.shake(0.5) })
    fx.after(76, () => fx.announcer('SELL SELL SELL'))

    // retracts to await the next signal
    tween(stage, arrow, v3(p.x, 11, p.z), 98, 126, { ease: easeIn })
    fx.after(104, () => { camBeat(fx, 'hold'); fx.caption('MARKET ORDER FILLED') })

    fx.after(150, end)
    fx.after(164, () => cleanupStage(stage))
  },
}

// ===========================================================================
// HEAVY tier (§23) — 3-4s heavyweight sendoffs
// ===========================================================================

// ---------------------------------------------------------------------------
// H1. PILEDRIVER EXCHANGE — grab, spin, piledriver through a floor panel
// ---------------------------------------------------------------------------
const PiledriverExchange = {
  id: 'piledriver-exchange',
  name: 'PILEDRIVER EXCHANGE',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.5, 0.7)
    fx.caption('THE EXCHANGE FLOOR')
    fx.sfx('grab')
    playSelf(fx, 'taunt')
    playFoe(fx, 'launched')
    camBeat(fx, 'push')

    // the floor panel that is about to have a bad day
    const panel = bx(2.2, 0.12, 2.2, 0x444a58)
    addMesh(stage, panel, v3(p.x, 0.06, p.z))

    // hoisted up
    fx.after(10, () => { fx.impulse(fx.foe, [0, 9, 0], 1); fx.sfx('whoosh', { pitch: 0.9 }) })
    fx.after(24, () => { fx.impulse(fx.foe, [0, 5, 0], 2); fx.particles('stars', v3(p.x, 2.5, p.z), { n: 4 }) })

    // the spin-up
    fx.after(36, () => { camBeat(fx, 'orbit'); fx.slowmo(0.4, 0.9); fx.caption('VOLUME SPIKE') })
    for (let i = 0; i < 3; i++) {
      fx.after(40 + i * 10, () => {
        fx.impulse(fx.foe, [0, 1.5, 0], 4)
        fx.sfx('whoosh', { pitch: 1.0 + i * 0.25, vol: 0.55 })
      })
    }
    fx.after(74, () => fx.slowmo(0.3, 0.8)) // apex hold

    // THE PILEDRIVER
    fx.after(84, () => {
      fx.sfx('break'); fx.sfx('explosion')
      fx.shake(1.5)
      fx.zoom(fx.foe, 0.9)
      fx.caption('THROUGH THE FLOOR')
      fx.hit({ damage: 14, knockback: { x: 0, y: 0 }, hitStun: 80 })
      fx.ragdoll(fx.foe, [d.x * 2, -6, d.z * 2])
      panel.rotation.x = 0.35
      panel.rotation.z = -0.22
      panel.position.y = -0.15
      blood(fx, 'blood_fountain', v3(p.x, 0.4, p.z), { n: 12 })
      fx.particles('impact', v3(p.x, 0.5, p.z), { n: 16 })
      fx.particles('dust', v3(p.x, 0.3, p.z), { n: 12 })
      // panel shrapnel
      for (let i = 0; i < 4; i++) {
        const chip = fx.spawnProp('box', v3(p.x, 0.4, p.z), { size: [0.4, 0.08, 0.4], color: 0x444a58, mass: 0.4 })
        if (chip) { try { fx.impulse(chip, [(Math.random() - 0.5) * 8, 5 + Math.random() * 4, (Math.random() - 0.5) * 8], 4) } catch { /* prop gone */ } }
      }
    })

    fx.after(112, () => fx.announcer('DELISTED FROM THE FLOOR'))
    fx.after(128, () => { camBeat(fx, 'hold'); fx.coins(v3(p.x, 1.0, p.z), 12); fx.caption('SETTLEMENT COMPLETE') })

    fx.after(198, end)
    fx.after(214, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// H2. WRECKING BULL — punched clean through a freshly delivered brick wall
// ---------------------------------------------------------------------------
function buildBrickWall() {
  const g = new THREE.Group()
  const cols = [0xb35438, 0xa04a30]
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 4; i++) {
      const brick = bx(0.24, 0.5, 0.98, cols[(row + i) % 2])
      brick.position.set(0, 0.3 + row * 0.56, -1.55 + i * 1.04 + (row % 2 ? 0.3 : 0))
      g.add(brick)
    }
  }
  return g
}

const WreckingBull = {
  id: 'wrecking-bull',
  name: 'WRECKING BULL',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)
    // wall goes up between the victim and open space
    const wpos = v3(clampX(fx, p.x + d.x * 3.2, 1.2), 0, clampZ(fx, p.z + d.z * 3.2, 1.2))

    fx.slowmo(0.5, 0.7)
    fx.caption('NEW CONSTRUCTION')
    fx.sfx('crane', { vol: 0.5 })
    playFoe(fx, 'hitHeavy')
    camBeat(fx, 'push')

    const wall = buildBrickWall()
    wall.rotation.y = Math.atan2(-d.z, d.x) // wall face square to the punch lane
    addMesh(stage, wall, v3(wpos.x, 7, wpos.z))
    tween(stage, wall, wpos, 6, 30, { ease: easeIn })
    fx.after(30, () => { fx.sfx('thud'); fx.shake(0.7); fx.particles('dust', v3(wpos.x, 0.3, wpos.z), { n: 10 }) })
    fx.after(40, () => fx.caption('PERMIT APPROVED'))

    // the wind-up... and the PUNCH
    fx.after(52, () => { playSelf(fx, 'taunt'); fx.slowmo(0.35, 0.8); fx.zoom(fx.foe, 0.8) })
    fx.after(62, () => {
      fx.sfx('punch_heavy'); fx.sfx('launch')
      fx.shake(1.2)
      fx.hit({ damage: 12, knockback: { x: 0, y: 0 }, hitStun: 80 })
      fx.ragdoll(fx.foe, [d.x * 24, 6, d.z * 24])
      playFoe(fx, 'launched')
      blood(fx, 'blood_spray', v3(p.x, 1.2, p.z), { n: 10, dir: { x: d.x, y: 0.4, z: d.z } })
    })

    // THROUGH the wall — masonry everywhere
    fx.after(72, () => {
      camBeat(fx, 'orbit')
      fx.sfx('break'); fx.sfx('explosion')
      fx.shake(1.5)
      fx.slowmo(0.3, 0.9)
      fx.caption('STRUCTURAL FAILURE')
      wall.visible = false // replaced by flying rubble
      fx.particles('impact', v3(wpos.x, 1.2, wpos.z), { n: 16 })
      fx.particles('dust', v3(wpos.x, 0.8, wpos.z), { n: 14 })
      for (let i = 0; i < 8; i++) {
        const brick = fx.spawnProp('box', v3(wpos.x, 0.6 + Math.random() * 1.8, wpos.z), { size: [0.24, 0.5, 0.9], color: i % 2 ? 0xb35438 : 0xa04a30, mass: 0.8 })
        if (brick) { try { fx.impulse(brick, [d.x * (4 + Math.random() * 6), 3 + Math.random() * 5, d.z * (4 + Math.random() * 6) + (Math.random() - 0.5) * 5], 5) } catch { /* prop gone */ } }
      }
    })

    // far-wall clang + settle
    fx.after(98, () => {
      const fp = fx.foe.pos
      fx.sfx('thud'); fx.shake(0.9)
      blood(fx, 'blood', v3(fp.x, 0.5, fp.z || 0), { n: 8 })
      fx.particles('sparks', v3(fp.x, 1.0, fp.z || 0), { n: 8 })
    })
    fx.after(116, () => fx.announcer('ZONING VIOLATION'))
    fx.after(134, () => { camBeat(fx, 'hold'); fx.caption('DEMOLITION COMPLETE'); fx.coins(v3(wpos.x, 1.2, wpos.z), 10) })

    fx.after(208, end)
    fx.after(224, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// H3. MARGIN HAMMER — the gavel of the market finds against you
// ---------------------------------------------------------------------------
function buildGavel() {
  const g = new THREE.Group()
  const head = cyl(0.7, 0.7, 2.0, 0x8a5a2b, 10)
  head.rotation.x = Math.PI / 2
  head.position.y = 0.7
  g.add(head)
  for (const s of [1, -1]) {
    const cap = cyl(0.78, 0.78, 0.25, 0xffcf3f, 10)
    cap.rotation.x = Math.PI / 2
    cap.position.set(0, 0.7, s * 1.1)
    g.add(cap)
  }
  const handle = cyl(0.16, 0.2, 2.6, 0x6b4a2b, 8)
  handle.position.y = 2.1
  g.add(handle)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0xffcf3f))
  knob.position.y = 3.4
  g.add(knob)
  return g
}

const MarginHammer = {
  id: 'margin-hammer',
  name: 'MARGIN HAMMER',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.5, 0.7)
    fx.caption('MARGIN COURT IS IN SESSION')
    fx.sfx('gong')
    playFoe(fx, 'knockdown')
    camBeat(fx, 'push')

    // the block: the defendant is placed upon it (spiritually)
    const block = cyl(1.5, 1.7, 0.3, 0x6b4a2b, 10)
    addMesh(stage, block, v3(p.x, 0.15, p.z))

    const gavel = buildGavel()
    addMesh(stage, gavel, v3(p.x, 10, p.z))
    // solemn descent
    tween(stage, gavel, v3(p.x, 3.4, p.z), 8, 56, { ease: smooth })
    fx.after(12, () => fx.sfx('drone_hum'))
    fx.after(58, () => fx.caption('THE COURT HAS REVIEWED YOUR POSITIONS'))

    // wind-up... hold...
    tween(stage, gavel, v3(p.x, 5.2, p.z), 72, 88, { ease: easeOut })
    fx.after(86, () => { fx.slowmo(0.32, 0.9); fx.zoom(fx.foe, 0.9) })

    // GUILTY
    tween(stage, gavel, v3(p.x, 0.45, p.z), 92, 100, { ease: easeIn })
    fx.after(100, () => {
      camBeat(fx, 'orbit')
      fx.sfx('break'); fx.sfx('thud')
      fx.shake(1.5)
      fx.caption('OVERRULED')
      fx.hit({ damage: 15, knockback: { x: 0, y: 0 }, hitStun: 80 })
      fx.ragdoll(fx.foe, [d.x * 3, -2, d.z * 3])
      blood(fx, 'blood', v3(p.x, 0.5, p.z), { n: 14 })
      fx.particles('impact', v3(p.x, 0.6, p.z), { n: 14 })
      fx.particles('dust', v3(p.x, 0.3, p.z), { n: 10 })
    })

    // order! order! (tap. tap.)
    tween(stage, gavel, v3(p.x, 1.6, p.z), 108, 118, { ease: easeOut })
    tween(stage, gavel, v3(p.x, 0.45, p.z), 122, 128, { ease: easeIn })
    fx.after(128, () => { fx.sfx('thud', { pitch: 1.3, vol: 0.5 }); fx.shake(0.5) })
    tween(stage, gavel, v3(p.x, 1.6, p.z), 132, 142, { ease: easeOut })
    tween(stage, gavel, v3(p.x, 0.45, p.z), 146, 152, { ease: easeIn })
    fx.after(152, () => { fx.sfx('thud', { pitch: 1.4, vol: 0.5 }); fx.shake(0.5) })
    fx.after(140, () => fx.announcer('ORDER! ORDER!'))

    // court adjourned
    fx.after(162, () => { camBeat(fx, 'hold'); fx.caption('CASE DISMISSED'); fx.coins(v3(p.x, 1.2, p.z), 10) })
    tween(stage, gavel, v3(p.x, 11, p.z), 170, 204, { ease: easeIn })

    fx.after(212, end)
    fx.after(228, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// H4. DOUBLE BOUNCE — wall, other wall, floor crater. Technical analysis.
// ---------------------------------------------------------------------------
const DoubleBounce = {
  id: 'double-bounce',
  name: 'DOUBLE BOUNCE',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)
    const b = bounds(fx)
    const wall1 = v3(
      d.x ? (d.x > 0 ? b.maxX - 0.5 : b.minX + 0.5) : p.x, 1.2,
      d.z ? (d.z > 0 ? b.maxZ - 0.5 : b.minZ + 0.5) : p.z
    )
    const wall2 = v3(
      d.x ? (d.x > 0 ? b.minX + 0.5 : b.maxX - 0.5) : p.x, 1.2,
      d.z ? (d.z > 0 ? b.minZ + 0.5 : b.maxZ - 0.5) : p.z
    )

    fx.slowmo(0.5, 0.6)
    fx.caption('VOLATILITY EVENT')
    fx.sfx('launch')
    playFoe(fx, 'launched')
    camBeat(fx, 'push')

    // leg 1: into the far wall
    fx.after(6, () => {
      fx.shake(0.7)
      fx.hit({ damage: 5, knockback: { x: 0, y: 0 }, hitStun: 70 })
      fx.ragdoll(fx.foe, [d.x * 21, 6, d.z * 21])
    })
    fx.after(28, () => {
      fx.sfx('thud'); fx.sfx('crack')
      fx.shake(1.0)
      fx.caption('RESISTANCE')
      fx.particles('sparks', wall1, { n: 10 })
      blood(fx, 'blood', wall1, { n: 6, dirX: -d.x })
      fx.impulse(fx.foe, [-d.x * 30, 5, -d.z * 30], 2)
      fx.slowmo(0.4, 0.6)
    })

    // leg 2: all the way back across into the opposite wall
    fx.after(58, () => {
      camBeat(fx, 'orbit')
      fx.sfx('thud'); fx.sfx('crack', { pitch: 0.8 })
      fx.shake(1.2)
      fx.caption('SUPPORT')
      fx.particles('sparks', wall2, { n: 12 })
      blood(fx, 'blood', wall2, { n: 8, dirX: d.x })
      // launched up and back toward center for the payoff
      fx.impulse(fx.foe, [d.x * 14, 15, d.z * 14], 3)
      fx.slowmo(0.32, 0.9)
      fx.zoom(fx.foe, 0.9)
    })
    fx.after(70, () => {
      const fp = fx.foe.pos
      fx.particles('stars', v3(fp.x, (fp.y || 1) + 0.5, fp.z || 0), { n: 5 })
    })

    // the crater
    const crater = cyl(1.5, 1.7, 0.06, 0x22242c, 12)
    fx.after(96, () => {
      const fp = fx.foe.pos
      fx.impulse(fx.foe, [0, -22, 0])
      addMesh(stage, crater, v3(clampX(fx, fp.x), 0.03, clampZ(fx, fp.z || 0)))
    })
    fx.after(104, () => {
      const fp = fx.foe.pos
      fx.sfx('break'); fx.sfx('explosion')
      fx.shake(1.5)
      fx.caption('FLOOR FOUND')
      fx.hit({ damage: 12, knockback: { x: 0, y: 0 }, hitStun: 80 })
      blood(fx, 'blood_fountain', v3(fp.x, 0.4, fp.z || 0), { n: 10 })
      fx.particles('impact', v3(fp.x, 0.5, fp.z || 0), { n: 16 })
      fx.particles('dust', v3(fp.x, 0.3, fp.z || 0), { n: 14 })
    })
    fx.after(126, () => fx.announcer('SUPPORT BECAME RESISTANCE'))
    fx.after(140, () => { camBeat(fx, 'hold'); fx.caption('CANDLE CLOSED') })

    fx.after(196, end)
    fx.after(212, () => cleanupStage(stage))
  },
}

// ---------------------------------------------------------------------------
// H5. BEAR HUG — a giant bear provides aggressive emotional support
// ---------------------------------------------------------------------------
function buildStandingBear() {
  const g = new THREE.Group()
  const body = bx(1.3, 2.2, 1.1, 0x6b4a2b)
  body.position.y = 2.0
  g.add(body)
  const belly = bx(0.9, 1.2, 0.4, 0x9c7a4d)
  belly.position.set(0.55, 1.8, 0)
  g.add(belly)
  const head = bx(0.9, 0.8, 0.85, 0x6b4a2b)
  head.position.set(0.15, 3.5, 0)
  g.add(head)
  const snout = bx(0.35, 0.35, 0.4, 0x9c7a4d)
  snout.position.set(0.65, 3.35, 0)
  g.add(snout)
  for (const s of [1, -1]) {
    const ear = bx(0.25, 0.25, 0.18, 0x4d3620)
    ear.position.set(0, 3.95, s * 0.32)
    g.add(ear)
    const leg = bx(0.5, 1.0, 0.5, 0x4d3620)
    leg.position.set(0, 0.5, s * 0.35)
    g.add(leg)
  }
  // arms pivot at the shoulder so they can close for the squeeze
  const arms = []
  for (const s of [1, -1]) {
    const arm = new THREE.Group()
    const limb = bx(1.5, 0.45, 0.45, 0x4d3620)
    limb.position.x = 0.75
    arm.add(limb)
    const paw = bx(0.4, 0.5, 0.5, 0x9c7a4d)
    paw.position.x = 1.5
    arm.add(paw)
    arm.position.set(0.4, 2.9, s * 0.75)
    arm.rotation.y = s * 0.9 // open, waiting
    g.add(arm)
    arms.push(arm)
  }
  return { g, arms }
}

const BearHug = {
  id: 'bear-hug',
  name: 'BEAR HUG',
  script(fx) {
    const end = onceEnd(fx)
    const stage = makeStage(fx)
    const p = anchor(fx)
    const d = openDir(fx)

    fx.slowmo(0.5, 0.7)
    fx.caption('FRIENDLY BEAR MARKET')
    fx.sfx('gong')
    playFoe(fx, 'hitHeavy')
    camBeat(fx, 'push')

    // the bear arrives behind the victim, arms open toward them
    const bpos = v3(clampX(fx, p.x - d.x * 1.3, 1.0), 0, clampZ(fx, p.z - d.z * 1.3, 1.0))
    const { g: bear, arms } = buildStandingBear()
    bear.rotation.y = Math.atan2(-d.z, d.x) // facing the victim/open space
    addMesh(stage, bear, v3(bpos.x, 9, bpos.z))
    tween(stage, bear, bpos, 6, 34, { ease: easeIn })
    fx.after(34, () => { fx.sfx('thud'); fx.shake(1.0); fx.particles('dust', v3(bpos.x, 0.3, bpos.z), { n: 12 }) })
    fx.after(44, () => fx.sfx('moo', { pitch: 0.45, vol: 0.7 }))

    // arms close — the squeeze begins
    const hugT0 = fx.age || 0
    fx.frame((rawAge) => {
      const age = rawAge - hugT0
      if (age >= 52 && age < 70) {
        const k = (age - 52) / 18
        for (const [i, arm] of arms.entries()) arm.rotation.y = (i ? -1 : 1) * (0.9 - 1.35 * k)
      } else if (age >= 118 && age < 126) {
        const k = (age - 118) / 8
        for (const [i, arm] of arms.entries()) arm.rotation.y = (i ? -1 : 1) * (-0.45 + 1.5 * k)
      }
    })
    fx.after(56, () => { fx.sfx('grab'); fx.caption('POSITION ENTERED'); playFoe(fx, 'launched') })
    for (let i = 0; i < 3; i++) {
      fx.after(66 + i * 16, () => {
        fx.sfx('crack', { pitch: 0.9 + i * 0.15 })
        fx.shake(0.6 + i * 0.2)
        fx.hit({ damage: 4, knockback: { x: 0, y: 0 }, hitStun: 50 })
        blood(fx, 'blood', v3(p.x, 1.6, p.z), { n: 5 })
        fx.particles('stars', v3(p.x, 2.2, p.z), { n: 4 })
      })
    }
    fx.after(84, () => { fx.slowmo(0.35, 0.8); fx.zoom(fx.foe, 0.8); fx.caption('MAXIMUM SQUEEZE') })

    // ...then hurls them across the arena
    fx.after(120, () => {
      camBeat(fx, 'orbit')
      fx.sfx('launch'); fx.sfx('whoosh', { pitch: 0.6 })
      fx.shake(1.3)
      fx.slowmo(0.3, 0.9)
      fx.caption('BEARISH REVERSAL')
      fx.hit({ damage: 10, knockback: { x: 0, y: 0 }, hitStun: 80 })
      fx.ragdoll(fx.foe, [d.x * 21, 14, d.z * 21])
      blood(fx, 'blood_spray', v3(p.x, 1.4, p.z), { n: 10, dir: { x: d.x, y: 0.5, z: d.z } })
    })
    fx.after(132, () => {
      const fp = fx.foe.pos
      fx.particles('stars', v3(fp.x, (fp.y || 1) + 0.5, fp.z || 0), { n: 5 })
    })
    fx.after(152, () => {
      const fp = fx.foe.pos
      fx.sfx('thud'); fx.shake(1.0)
      blood(fx, 'blood', v3(fp.x, 0.4, fp.z || 0), { n: 8 })
      fx.particles('dust', v3(fp.x, 0.25, fp.z || 0), { n: 10 })
    })
    fx.after(162, () => { camBeat(fx, 'hold'); fx.announcer('THE BEAR SENDS ITS REGARDS') })

    // a polite wave, then back to the woods (sky)
    fx.after(176, () => { arms[0].rotation.z = 0.9; fx.sfx('moo', { pitch: 0.6, vol: 0.5 }) })
    tween(stage, bear, v3(bpos.x, 10, bpos.z), 188, 222, { ease: easeIn })

    fx.after(228, end)
    fx.after(244, () => cleanupStage(stage))
  },
}

// ===========================================================================
// ABSURD-tier context echo (§23) — a 0.5s beat replaying the special that
// landed the KO before the execution proper starts.
// ===========================================================================
const ECHO_FRAMES = 30

// Ghost props for THE FLASHIEST recognizable killing moves.
function buildGhostTornado() {
  const g = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const ring = cyl(0.4 + i * 0.35, 0.3 + i * 0.3, 0.55, 0xffcf3f, 8, { transparent: true, opacity: 0.4 })
    ring.position.y = 0.4 + i * 0.6
    g.add(ring)
  }
  return g
}
function buildGhostRocket() {
  const g = new THREE.Group()
  const body = cyl(0.45, 0.45, 2.0, 0xe8ecf2, 8, { transparent: true, opacity: 0.45 })
  body.position.y = 1.4
  g.add(body)
  const nose = cyl(0.02, 0.45, 0.9, 0xff4d5e, 8, { transparent: true, opacity: 0.45 })
  nose.position.y = 2.85
  g.add(nose)
  for (let i = 0; i < 3; i++) {
    const fin = bx(0.5, 0.7, 0.08, 0xff4d5e, { transparent: true, opacity: 0.45 })
    const a = (i / 3) * Math.PI * 2
    fin.position.set(Math.cos(a) * 0.5, 0.55, Math.sin(a) * 0.5)
    fin.rotation.y = -a
    g.add(fin)
  }
  return g
}
function buildGhostCandle() {
  const g = new THREE.Group()
  const body = bx(0.8, 2.6, 0.8, 0x37e07a, { transparent: true, opacity: 0.45 })
  body.position.y = 1.5
  g.add(body)
  const wickT = bx(0.12, 0.8, 0.12, 0x37e07a, { transparent: true, opacity: 0.45 })
  wickT.position.y = 3.2
  g.add(wickT)
  const wickB = bx(0.12, 0.5, 0.12, 0x37e07a, { transparent: true, opacity: 0.45 })
  wickB.position.y = -0.05
  g.add(wickB)
  return g
}
function buildGhostIce() {
  const g = new THREE.Group()
  const cube = bx(1.8, 1.8, 1.8, 0x9fd8ff, { transparent: true, opacity: 0.4 })
  cube.position.y = 1.1
  g.add(cube)
  const core = bx(0.9, 0.9, 0.9, 0xe8f6ff, { transparent: true, opacity: 0.5 })
  core.position.y = 1.1
  g.add(core)
  return g
}

const ECHO_GHOSTS = {
  'tokenization-tornado': buildGhostTornado, // wally
  'permanent-reserve': buildGhostTornado,    // wally (super)
  'to-the-moon': buildGhostRocket,           // dogey (rocket)
  'god-candle': buildGhostCandle,            // blackish-bull
  'cold-storage': buildGhostIce,             // fatty-pingo
}

// Plays the echo beat when the KO came off a special/super. Returns the frame
// delay the wrapped execution should wait before starting (0 = start now).
function echoBeat(fx, fallbackCtx) {
  const ctx = fx.context || fallbackCtx
  const kind = ctx?.killingKind
  if (kind !== 'special' && kind !== 'super') return 0
  try {
    const stage = makeStage(fx)
    const at = selfPos(fx)
    fx.slowmo(0.35, 0.55)
    fx.zoom(fx.self, 0.4)
    fx.shake(0.3)
    // flash the attacker...
    const flash = bx(1.5, 2.3, 1.5, 0xffffff, { transparent: true, opacity: 0.55 })
    addMesh(stage, flash, v3(at.x, 1.15, at.z))
    grow(stage, flash, 0.5, 1.4, 0, 10, easeOut)
    fx.after(12, () => { flash.visible = false })
    fx.particles('sparks', v3(at.x, 1.4, at.z), { n: 10 })
    // ...replay the killing move's sfx (registry lookup, generic surge fallback)...
    const def = Characters?.[ctx?.attackerCharId]
    const mv = def?.moves?.find?.((m) => m && m.id === ctx?.killingMoveId)
    fx.sfx(mv?.sfx || 'surge')
    // ...and raise a scaled ghost of its signature prop when we recognize it.
    const buildGhost = ECHO_GHOSTS[ctx?.killingMoveId]
    if (buildGhost) {
      const ghost = buildGhost()
      addMesh(stage, ghost, v3(at.x, 0.1, at.z))
      grow(stage, ghost, 0.35, 2.0, 2, ECHO_FRAMES - 2)
      spin(stage, ghost, 'y', 0.22, 0, ECHO_FRAMES + 10)
    }
    fx.after(ECHO_FRAMES + 10, () => cleanupStage(stage))
  } catch (e) {
    console.error('[combat] execution echo beat threw', e)
    return 0
  }
  return ECHO_FRAMES
}

// Wrap an absurd entry so it opens with the echo beat when context calls for
// one. Ids are preserved (excludeId / lastExecutionId keep working).
function withEcho(entry, pickCtx) {
  return {
    id: entry.id,
    name: entry.name,
    script(fx) {
      const delay = echoBeat(fx, pickCtx)
      if (!delay) return entry.script(fx)
      const startAge = fx.age || 0
      fx.after(delay, () => {
        // If a skip force-flushed us before the beat played, real frames never
        // elapsed — do NOT start the main script inside the flush (its meshes
        // would outlive the fx). The flush itself already ran our cleanup.
        if ((fx.age || 0) - startAge < delay) return
        entry.script(fx)
      })
    },
  }
}

// The attacker's own signature finisher, wrapped as a pool entry (§23: it
// joins that fighter's absurd rotation). Registry is read-only.
function signatureEntry(charId) {
  if (!charId) return null
  const def = Characters?.[charId]
  const fin = def?.finisher
  if (!fin || typeof fin.script !== 'function') return null
  return {
    id: `signature-${fin.id || charId}`,
    name: fin.name || `${def.name || charId} SIGNATURE`,
    script: (fx) => fin.script(fx),
  }
}

// ---------------------------------------------------------------------------
// the pools
// ---------------------------------------------------------------------------
export const BASIC_EXECUTIONS = [
  UppercutOrbit,
  CoinShowerSlam,
  TickerTape,
  DustOff,
  SellSignal,
]

export const HEAVY_EXECUTIONS = [
  PiledriverExchange,
  WreckingBull,
  MarginHammer,
  DoubleBounce,
  BearHug,
]

// The §21 eight — the ABSURD tier (kept under the historic export name).
export const EXECUTIONS = [
  MarketSteamroller,
  LiquidationTruck,
  OrbitalCandleStrike,
  HandOfTheMarket,
  BearRaid,
  EtfVacuum,
  FinalAudit,
  TheRug,
]

export const ExecutionPool = {
  list: EXECUTIONS,
  basic: BASIC_EXECUTIONS,
  heavy: HEAVY_EXECUTIONS,
  absurd: EXECUTIONS,

  // §23: tiered pick. tier: 'basic'|'heavy'|'absurd' (unknown → absurd).
  // opts.excludeId: never repeat the tier's last execution (unless it is the
  // only entry). opts.context: { killingMoveId, killingKind, attackerCharId } —
  // used as a fallback when the engine hasn't set fx.context, and to fold the
  // attacker's signature finisher into their absurd rotation.
  pickTier(tier, opts = {}) {
    const { excludeId = null, context = null } = opts
    const t = String(tier || 'absurd').toLowerCase()
    let pool
    if (t === 'basic') {
      pool = BASIC_EXECUTIONS
    } else if (t === 'heavy') {
      pool = HEAVY_EXECUTIONS
    } else {
      pool = EXECUTIONS.map((e) => withEcho(e, context))
      const sig = signatureEntry(context?.attackerCharId)
      if (sig) pool = [...pool, sig]
    }
    const filtered = excludeId == null ? pool : pool.filter((e) => e.id !== excludeId)
    const src = filtered.length ? filtered : pool
    return src[Math.floor(Math.random() * src.length)]
  },

  // Back-compat alias (§21 flow): an absurd-tier pick with no context.
  pick(excludeId) {
    return this.pickTier('absurd', { excludeId })
  },
}
