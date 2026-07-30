// THE ITEM ROSTER — v1.1 pickup items per CONTRACTS.md §14.
// One entry per item: low-poly procedural mesh builder + one scripted use-effect.
// Absurdity scales with arena tier (ArenaOrder index 0-9): tier 0 is stale office
// junk, tier 9 breaks reality. Effects run through the EffectContext handed in by
// ItemSystem (ctx) — never import combat modules directly; everything routes via
// the match handles / events / audio that ctx wraps, so headless stubs still work.
//
// ItemDef = {
//   kind, name, tier,
//   ai: { type: 'melee'|'ranged'|'self'|'trap'|'any', range },  // AI-use heuristic hints
//   heldScale,            // scale while parented near the hand (default 0.6)
//   groundY,              // hover height of the bob (default 0.55)
//   build() => THREE.Group,
//   effect(ctx),          // consume: the scripted payoff
// }
import * as THREE from 'three'

// ---------------------------------------------------------------- mesh helpers
// Materials are cached module-wide and NEVER disposed (small fixed palette) so
// pooled item meshes can be geometry-disposed without killing shared materials.
const MATS = new Map()
export function mat(color, opts = {}) {
  const key = color + '|' + (opts.transparent ? 't' + (opts.opacity ?? 1) : '') + (opts.emissive ? 'e' + opts.emissive : '')
  if (!MATS.has(key)) {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts })
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive)
    MATS.set(key, m)
  }
  return MATS.get(key)
}
export function bx(w, h, d, color, opts) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts)) }
export function cyl(rt, rb, h, color, seg = 8, opts) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts)) }
export function sph(r, color, seg = 6, opts) { return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 1)), mat(color, opts)) }
export function cone(r, h, color, seg = 8) { return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color)) }
export function torus(r, t, color, seg = 8, tub = 10, opts) { return new THREE.Mesh(new THREE.TorusGeometry(r, t, seg, tub), mat(color, opts)) }
export function grp(...kids) { const g = new THREE.Group(); for (const k of kids) g.add(k); return g }
function at(m, x, y, z, rx = 0, ry = 0, rz = 0) { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m }

const C = {
  gold: 0xffcf3f, red: 0xff4d5e, green: 0x37e07a, blue: 0x4dc3ff, ice: 0x9adfff,
  purple: 0xb45cff, pink: 0xff6fd8, white: 0xf2f4f8, grey: 0x9aa0ad, dark: 0x2a2e38,
  tan: 0xc9a166, brown: 0x8a6a42, orange: 0xff8c2e, cream: 0xfff3d6, steel: 0x8a93a6,
  swamp: 0x6fae4e, wood: 0xb07a3c, paper: 0xe9e4d4,
}

// ---------------------------------------------------------------- shared bits
function meleeSwing(ctx, { range, damage, kb, sfx, caption, shakeMag = 0.6, burst = 'impact', whiffPitch = 1 }) {
  ctx.sfx('whoosh', { pitch: whiffPitch })
  ctx.after(6, () => {
    if (ctx.foeInFront(range)) {
      ctx.hit({ damage, knockback: kb, hitStun: 20 })
      if (sfx) ctx.sfx(sfx)
      if (burst) ctx.burst(burst, ctx.foeChest(), { dirX: ctx.dir })
      if (caption) ctx.caption(caption)
      if (shakeMag) ctx.shake(shakeMag)
    }
    ctx.end()
  })
}

// expanding flat shockwave ring, purely visual, self-cleaning
function ringWave(ctx, pos, color, { life = 26, from = 0.4, to = 7 } = {}) {
  const ring = torus(0.5, 0.05, color, 6, 24, { transparent: true, opacity: 0.85 })
  ring.rotation.x = -Math.PI / 2
  ring.position.set(pos.x, (pos.y ?? 0) + 0.12, pos.z ?? 0)
  ctx.addMesh(ring)
  let f = 0
  ctx.frame(() => {
    f++
    const t = f / life
    const s = from + (to - from) * t
    ring.scale.set(s, s, 1)
    if (f >= life) ctx.removeMesh(ring)
  })
}

// ---------------------------------------------------------------- the roster
export const ITEM_ROSTER = [
  // ===== T0 MEME MARKET — stale office junk ==================================
  [
    {
      kind: 'stale-coffee', name: 'STALE COFFEE', tier: 0,
      ai: { type: 'melee', range: 2.8 },
      build() {
        const cup = cyl(0.16, 0.13, 0.3, C.white)
        const brew = at(cyl(0.14, 0.14, 0.03, C.brown), 0, 0.16, 0)
        const handle = at(torus(0.09, 0.025, C.white, 6, 8), 0.17, 0, 0)
        return grp(cup, brew, handle)
      },
      effect(ctx) {
        ctx.sfx('whoosh', { pitch: 0.7 })
        ctx.burst('dust', { x: ctx.self.pos.x + ctx.dir * 1.2, y: 1.2, z: 0 }, { dirX: ctx.dir, n: 12 })
        ctx.after(4, () => {
          if (ctx.foeInFront(3)) {
            ctx.hit({ damage: 5, hitStun: 18 })
            ctx.caption('DECAF?!')
            ctx.foe.speedMult = 0.55
            ctx.revert(150, () => { ctx.foe.speedMult = 1 })
          }
          ctx.end()
        })
      },
    },
    {
      kind: 'stapler', name: 'STAPLER', tier: 0,
      ai: { type: 'ranged', range: 8 },
      build() {
        const base = bx(0.42, 0.07, 0.14, C.dark)
        const top = at(bx(0.4, 0.08, 0.13, C.red), -0.02, 0.1, 0, 0, 0, 0.12)
        return grp(base, top)
      },
      effect(ctx) {
        ctx.sfx('throw')
        ctx.projectile({
          mesh: grp(bx(0.34, 0.07, 0.12, C.red)), y: 1.3, vx: ctx.dir * 14, spin: 10,
          onHit(f) {
            ctx.hit({ damage: 6, hitStun: 16, knockback: { x: 3, y: 0 } })
            ctx.sfx('crack', { pitch: 1.4 }); ctx.burst('sparks', ctx.foeChest())
          },
        })
        ctx.after(80, () => ctx.end())
      },
    },
    {
      kind: 'foam-finger', name: 'FOAM FINGER', tier: 0,
      ai: { type: 'melee', range: 2.6 },
      build() {
        const palm = bx(0.34, 0.42, 0.1, C.gold)
        const finger = at(bx(0.13, 0.3, 0.1, C.gold), -0.08, 0.34, 0)
        const cuff = at(bx(0.36, 0.12, 0.12, C.red), 0, -0.26, 0)
        return grp(palm, finger, cuff)
      },
      effect(ctx) {
        meleeSwing(ctx, {
          range: 2.7, damage: 6, kb: { x: 16, y: 5, spin: 2.5 },
          sfx: 'boing', caption: 'YEETED!', shakeMag: 0.8, whiffPitch: 0.8,
        })
      },
    },
    {
      kind: 'bag-of-dip', name: 'BAG OF DIP', tier: 0,
      ai: { type: 'self' },
      build() {
        const bag = bx(0.34, 0.4, 0.2, C.brown)
        const fold = at(bx(0.36, 0.08, 0.22, C.tan), 0, 0.22, 0)
        const chip = at(bx(0.12, 0.02, 0.12, C.gold), 0.06, 0.28, 0, 0, 0.6, 0)
        return grp(bag, fold, chip)
      },
      effect(ctx) {
        ctx.heal(ctx.self, 8)
        ctx.caption('BOUGHT THE DIP')
        ctx.sfx('coin'); ctx.burst('stars', ctx.selfChest(), { n: 6 })
        ctx.end()
      },
    },
  ],

  // ===== T1 LIQUIDITY SWAMP — slippery nonsense ==============================
  [
    {
      kind: 'soap-frog', name: 'SOAP FROG', tier: 1,
      ai: { type: 'ranged', range: 8 },
      build() {
        const body = sph(0.22, C.swamp, 7)
        body.scale.set(1.2, 0.8, 1)
        const eyeL = at(sph(0.07, C.white, 5), 0.1, 0.16, 0.1)
        const eyeR = at(sph(0.07, C.white, 5), 0.1, 0.16, -0.1)
        return grp(body, eyeL, eyeR)
      },
      effect(ctx) {
        ctx.sfx('throw'); ctx.sfx('croak', { pitch: 1.2 })
        const m = sph(0.2, C.swamp, 6); m.scale.set(1.2, 0.8, 1)
        ctx.projectile({
          mesh: grp(m), y: 1.4, vx: ctx.dir * 10, vy: 3.5, grav: -22, spin: 6, bounces: 1,
          onHit(f) {
            ctx.sfx('croak'); ctx.sfx('slide')
            ctx.caption('SLIPPED!')
            ctx.launch(f, ctx.dir * 2.5, 5, 3) // pratfall into knockdown
            ctx.burst('smoke', { x: f.pos.x, y: 0.3, z: 0 })
          },
        })
        ctx.after(120, () => ctx.end())
      },
    },
    {
      kind: 'bubble-wand', name: 'BUBBLE WAND', tier: 1,
      ai: { type: 'melee', range: 3.4 },
      build() {
        const stick = cyl(0.03, 0.03, 0.4, C.pink)
        const loop = at(torus(0.14, 0.03, C.blue, 6, 10), 0, 0.32, 0)
        return grp(stick, loop)
      },
      effect(ctx) {
        ctx.sfx('boing', { pitch: 1.6, vol: 0.5 })
        if (!ctx.foeNear(3.6) || ctx.foe.isInvulnerable?.()) { ctx.end(); return }
        const foe = ctx.foe
        const bubble = sph(0.9, C.blue, 8, { transparent: true, opacity: 0.35 })
        ctx.addMesh(bubble)
        ctx.launch(foe, 0, 2, 0.5)
        ctx.caption('BUBBLED!')
        let f = 0
        const FLOAT = 80
        ctx.frame(() => {
          f++
          if (foe.state !== 'launched' || f >= FLOAT) {
            // pop!
            ctx.removeMesh(bubble)
            ctx.sfx('break', { pitch: 1.5 }); ctx.burst('impact', { x: foe.pos.x, y: foe.pos.y + 1, z: 0 })
            if (foe.state === 'launched') ctx.launch(foe, ctx.dir * 3, 5.5, 1.5)
            ctx.end()
            return
          }
          foe.vel.x = 0
          foe.vel.y = 1.5 // serene float upward, gravity is a suggestion
          bubble.position.set(foe.pos.x, foe.pos.y + 1, 0)
        })
      },
    },
    {
      kind: 'sus-flask', name: 'SUS FLASK', tier: 1,
      ai: { type: 'self' },
      build() {
        const body = sph(0.18, C.green, 7, { transparent: true, opacity: 0.85 })
        const neck = at(cyl(0.05, 0.05, 0.18, C.green), 0, 0.22, 0)
        const cork = at(cyl(0.06, 0.06, 0.06, C.brown), 0, 0.33, 0)
        return grp(body, neck, cork)
      },
      effect(ctx) {
        ctx.sfx('croak', { pitch: 0.7, vol: 0.5 }) // gulp gulp
        if (Math.random() < 0.55) {
          ctx.heal(ctx.self, 12)
          ctx.caption('FELT GREAT, HIGHLY LEGIT')
          ctx.burst('stars', ctx.selfChest(), { n: 8 })
          ctx.end()
        } else {
          ctx.caption('RUG PULLED (INTERNALLY)')
          const self = ctx.self
          for (let i = 1; i <= 6; i++) ctx.after(i * 25, () => {
            ctx.hurt(self, 1)
            ctx.burst('smoke', { x: self.pos.x, y: self.pos.y + 1.6, z: 0 }, { n: 3 })
          })
          ctx.after(160, () => ctx.end())
        }
      },
    },
  ],

  // ===== T2 FROZEN TOKEN LAB — cold storage ==================================
  [
    {
      kind: 'freeze-grenade', name: 'FREEZE GRENADE', tier: 2,
      ai: { type: 'ranged', range: 8 },
      build() {
        const body = sph(0.2, C.ice, 8)
        const band = at(torus(0.19, 0.03, C.blue, 6, 12), 0, 0, 0, Math.PI / 2)
        const pin = at(torus(0.05, 0.015, C.steel, 5, 8), 0, 0.24, 0)
        return grp(body, band, pin)
      },
      effect(ctx) {
        ctx.sfx('throw')
        ctx.projectile({
          mesh: grp(sph(0.18, C.ice, 7)), y: 1.4, vx: ctx.dir * 11, vy: 2.5, grav: -22, spin: 7,
          onHit(f) {
            ctx.sfx('freeze'); ctx.caption('COLD WALLET')
            ctx.hit({ damage: 4 })
            ctx.hitstun(f, 90, true)
            f.flash?.(0x9adfff, 90)
            ctx.burst('sparks', { x: f.pos.x, y: f.pos.y + 1.2, z: 0 }, { n: 16 })
          },
          onLand(x) { ctx.sfx('freeze', { vol: 0.4, pitch: 1.3 }); ctx.burst('sparks', { x, y: 0.2, z: 0 }, { n: 8 }) },
        })
        ctx.after(120, () => ctx.end())
      },
    },
    {
      kind: 'icicle-bat', name: 'ICICLE BAT', tier: 2,
      ai: { type: 'self' },
      build() {
        const shaft = cyl(0.05, 0.09, 0.72, C.ice, 7)
        const tip = at(cone(0.05, 0.14, C.white, 7), 0, 0.43, 0)
        return grp(shaft, tip)
      },
      effect(ctx) {
        // 3-hit melee buff: next 3 landed hits carry frost damage
        const self = ctx.self
        self.damageMult = Math.max(self.damageMult, 1.45)
        self.flash?.(0x9adfff, 10)
        ctx.sfx('freeze', { pitch: 1.2, vol: 0.6 })
        ctx.caption('ICE COLD HANDS')
        let hits = 0
        const off = ctx.events?.on?.('fighter:hit', (e) => {
          if (!e || e.slot !== ctx.foe.slot) return
          hits++
          ctx.burst('sparks', { x: ctx.foe.pos.x, y: ctx.foe.pos.y + 1.2, z: 0 }, { n: 6 })
          if (hits >= 3) done()
        })
        let doneOnce = false
        const done = () => {
          if (doneOnce) return
          doneOnce = true
          off?.()
          self.damageMult = 1
          ctx.end()
        }
        ctx.cleanup(done)
        ctx.after(480, done) // buff can't be hoarded forever
      },
    },
    {
      kind: 'portable-heater', name: 'PORTABLE HEATER', tier: 2,
      ai: { type: 'self' },
      build() {
        const body = bx(0.36, 0.3, 0.2, C.orange)
        const g1 = at(bx(0.3, 0.03, 0.22, C.dark), 0, 0.06, 0)
        const g2 = at(bx(0.3, 0.03, 0.22, C.dark), 0, -0.04, 0)
        return grp(body, g1, g2)
      },
      effect(ctx) {
        ctx.heal(ctx.self, 6)
        ctx.self.speedMult = Math.max(ctx.self.speedMult, 1.35)
        ctx.revert(210, () => { ctx.self.speedMult = 1 })
        ctx.sfx('geyser', { vol: 0.6 })
        ctx.caption('TOASTY')
        try { ctx.arena?.meltFrost?.() } catch { /* arena hook optional */ }
        for (let i = 0; i < 4; i++) ctx.after(i * 12, () => ctx.burst('smoke', ctx.selfChest(), { n: 4 }))
        ctx.after(60, () => ctx.end())
      },
    },
  ],

  // ===== T3 SETTLEMENT EXPRESS — postal chaos ================================
  [
    {
      kind: 'suspicious-package', name: 'SUSPICIOUS PACKAGE', tier: 3,
      ai: { type: 'ranged', range: 7 },
      build() {
        const boxm = bx(0.34, 0.28, 0.28, C.wood)
        const tape = at(bx(0.36, 0.06, 0.3, C.tan), 0, 0.06, 0)
        const stamp = at(bx(0.1, 0.01, 0.08, C.red), 0.08, 0.15, 0.06)
        return grp(boxm, tape, stamp)
      },
      effect(ctx) {
        ctx.sfx('throw')
        const pkgMesh = grp(bx(0.32, 0.26, 0.26, C.wood))
        const boom = (x) => {
          ctx.sfx('explosion'); ctx.shake(1.2)
          ctx.burst('explosion', { x, y: 0.6, z: 0 })
          ringWave(ctx, { x, y: 0 }, C.orange)
          if (Math.abs(ctx.foe.pos.x - x) < 2.3 && !ctx.foe.isInvulnerable?.()) {
            ctx.hit({ damage: 14, knockback: { x: 10, y: 8, spin: 2 }, pos: { x, y: 1 } })
          }
          if (Math.abs(ctx.self.pos.x - x) < 2.3) { // return to sender
            ctx.hurt(ctx.self, 5)
            ctx.launch(ctx.self, Math.sign(ctx.self.pos.x - x || 1) * 6, 6, 1.5)
            ctx.caption('RETURN TO SENDER')
          }
          ctx.end()
        }
        ctx.projectile({
          mesh: pkgMesh, y: 1.3, vx: ctx.dir * 9, vy: 3, grav: -22, spin: 5,
          onHit(f) { boom(f.pos.x) },
          onLand(x) {
            // sits there ticking, blinking red, then detonates
            pkgMesh.position.set(x, 0.15, 0)
            let f = 0
            ctx.frame(() => {
              f++
              pkgMesh.visible = (f >> 2) % 2 === 0 || f < 30
              if (f >= 72) { ctx.removeMesh(pkgMesh); boom(x) }
            })
            return true // keep the mesh alive
          },
        })
      },
    },
    {
      kind: 'signal-lantern', name: 'SIGNAL LANTERN', tier: 3,
      ai: { type: 'any', range: 9 },
      build() {
        const frame = bx(0.2, 0.3, 0.2, C.dark)
        const glass = at(bx(0.14, 0.2, 0.14, C.gold, { emissive: 0x8a6a1c }), 0, 0, 0)
        const ring = at(torus(0.07, 0.02, C.dark, 5, 8), 0, 0.2, 0)
        return grp(frame, glass, ring)
      },
      effect(ctx) {
        ctx.sfx('train_horn')
        ctx.caption('EXPRESS DELIVERY')
        const dir = ctx.dir
        const b = ctx.bounds
        const train = grp(
          bx(1.4, 0.55, 0.5, C.red),
          at(bx(0.5, 0.35, 0.45, C.dark), 0.55, 0.42, 0),
          at(cyl(0.09, 0.12, 0.3, C.dark), -0.4, 0.44, 0),
        )
        train.position.set(dir > 0 ? b.minX - 1.5 : b.maxX + 1.5, 0.3, 0)
        ctx.addMesh(train)
        let hitDone = false
        ctx.after(28, () => {
          ctx.frame(() => {
            train.position.x += dir * 15 / 60
            if ((ctx.frameAge & 7) === 0) ctx.burst('smoke', { x: train.position.x + 0.5, y: 0.9, z: 0 }, { n: 2 })
            const foe = ctx.foe
            if (!hitDone && foe.grounded?.() && Math.abs(foe.pos.x - train.position.x) < 1 && !foe.isInvulnerable?.()) {
              hitDone = true
              ctx.hit({ damage: 8, knockback: { x: 6, y: 6, spin: 2 } })
              ctx.sfx('thud'); ctx.shake(0.7)
            }
            if (train.position.x < b.minX - 2 || train.position.x > b.maxX + 2) {
              ctx.removeMesh(train)
              ctx.end()
            }
          })
        })
      },
    },
    {
      kind: 'mailbag', name: 'MAILBAG', tier: 3,
      ai: { type: 'melee', range: 2.8 },
      build() {
        const bag = sph(0.26, C.grey, 7)
        bag.scale.set(1, 1.15, 0.8)
        const tie = at(cyl(0.06, 0.06, 0.08, C.brown), 0, 0.3, 0)
        const tag = at(bx(0.1, 0.08, 0.01, C.paper), 0.14, 0.28, 0)
        return grp(bag, tie, tag)
      },
      effect(ctx) {
        ctx.sfx('whoosh', { pitch: 0.9 })
        ctx.caption('CERTIFIED MAIL')
        for (let i = 0; i < 5; i++) ctx.after(6 + i * 8, () => {
          if (ctx.foeNear(2.9)) {
            ctx.hit({ damage: 2, hitStun: 12 }) // a thousand paper cuts (five)
            ctx.sfx('whoosh', { pitch: 1.5, vol: 0.4 })
            ctx.burst('confetti', ctx.foeChest(), { n: 8 })
          }
        })
        ctx.after(60, () => ctx.end())
      },
    },
  ],

  // ===== T4 MOUNTAIN NODE VILLAGE — monk gear ================================
  [
    {
      kind: 'gong-hammer', name: 'GONG HAMMER', tier: 4,
      ai: { type: 'melee', range: 2.6 },
      build() {
        const handle = cyl(0.04, 0.04, 0.6, C.wood)
        const head = at(cyl(0.14, 0.14, 0.3, C.gold), 0, 0.32, 0, 0, 0, Math.PI / 2)
        return grp(handle, head)
      },
      effect(ctx) {
        ctx.sfx('whoosh', { pitch: 0.6 })
        ctx.after(8, () => {
          ctx.sfx('gong')
          ringWave(ctx, { x: ctx.self.pos.x, y: 0.4 }, C.gold, { to: 12, life: 34 })
          ctx.shake(1.3)
          if (ctx.foeInFront(2.7)) {
            ctx.hit({ damage: 16, knockback: { x: 13, y: 7, spin: 2 } })
            ctx.caption('ENLIGHTENED.')
            ctx.slowmo(0.5, 0.4)
          }
          ctx.end()
        })
      },
    },
    {
      kind: 'chain-whip', name: 'CHAIN WHIP', tier: 4,
      ai: { type: 'ranged', range: 7.5 },
      build() {
        const handle = cyl(0.05, 0.05, 0.3, C.wood)
        const g = grp(handle)
        for (let i = 0; i < 4; i++) g.add(at(torus(0.06, 0.02, C.steel, 5, 8), 0, 0.24 + i * 0.11, 0, i % 2 ? Math.PI / 2 : 0))
        return g
      },
      effect(ctx) {
        ctx.sfx('whoosh', { pitch: 1.2 })
        const foe = ctx.foe, self = ctx.self
        const dist = Math.abs(foe.pos.x - self.pos.x)
        if (dist < 8 && !foe.isInvulnerable?.()) {
          // chain zips out, then YOINK
          const chain = bx(1, 0.05, 0.05, C.steel)
          chain.position.set(self.pos.x + ctx.dir * dist / 2, 1.2, 0)
          chain.scale.x = dist
          ctx.addMesh(chain)
          ctx.after(6, () => {
            ctx.sfx('grab'); ctx.sfx('slide', { pitch: 0.7 })
            ctx.caption('YANKED!')
            const pull = Math.max(6, Math.min(14, dist * 2.2))
            ctx.hit({ damage: 4 })
            ctx.launch(foe, Math.sign(self.pos.x - foe.pos.x || 1) * pull, 4.5, 2)
            ctx.removeMesh(chain)
            ctx.end()
          })
        } else { ctx.after(6, () => ctx.end()) }
      },
    },
    {
      kind: 'prayer-snowball', name: 'PRAYER SNOWBALL', tier: 4,
      ai: { type: 'ranged', range: 9 },
      build() {
        const ball = sph(0.2, C.white, 8)
        const beads = at(torus(0.16, 0.025, C.red, 5, 10), 0, 0.1, 0, 1.2)
        return grp(ball, beads)
      },
      effect(ctx) {
        ctx.sfx('throw')
        const ball = grp(sph(0.2, C.white, 8))
        const startX = ctx.self.pos.x
        ctx.projectile({
          mesh: ball, y: 0.35, vx: ctx.dir * 8.5, spin: 9,
          update(m) {
            // grows as it rolls — faith compounds
            const travel = Math.abs(m.position.x - startX)
            const s = 1 + Math.min(2.6, travel * 0.28)
            m.scale.setScalar(s)
            m.position.y = 0.2 * s + 0.15
            if ((ctx.frameAge & 3) === 0) ctx.burst('smoke', { x: m.position.x, y: 0.2, z: 0 }, { n: 2 })
          },
          radius: 1.1,
          onHit(f) {
            const travel = Math.abs(f.pos.x - startX)
            const dmg = Math.min(20, Math.round(6 + travel * 1.8))
            ctx.sfx('thud', { pitch: 0.7 }); ctx.shake(0.4 + travel * 0.06)
            ctx.hit({ damage: dmg, knockback: { x: 6 + travel, y: 5 + travel * 0.4, spin: 2 } })
            ctx.burst('impact', ctx.foeChest(), { n: 14 })
            if (travel > 5) ctx.caption('AVALANCHE!')
          },
        })
        ctx.after(140, () => ctx.end())
      },
    },
  ],

  // ===== T5 LOST BLOCK MUSEUM — digital artifacts ============================
  [
    {
      kind: 'glitch-gun', name: 'GLITCH GUN', tier: 5,
      ai: { type: 'any', range: 9 },
      build() {
        const body = bx(0.34, 0.14, 0.1, C.purple)
        const grip = at(bx(0.09, 0.2, 0.09, C.dark), -0.1, -0.14, 0, 0, 0, 0.2)
        const dish = at(cyl(0.11, 0.05, 0.1, C.pink), 0.22, 0, 0, 0, 0, Math.PI / 2)
        return grp(body, grip, dish)
      },
      effect(ctx) {
        const foe = ctx.foe
        ctx.sfx('glitch')
        ctx.caption('CONTROLS CORRUPTED')
        ctx.burst('confetti', ctx.foeChest(), { n: 12 })
        const orig = foe.ctrl
        const swap = (a) => (a === 'left' ? 'right' : a === 'right' ? 'left' : a)
        const wrap = new Proxy(orig, {
          get(t, k) {
            if (k === 'isDown') return (a) => t.isDown(swap(a))
            if (k === 'pressed') return (a) => t.pressed(swap(a))
            if (k === 'axis') return () => -t.axis()
            const v = t[k]
            return typeof v === 'function' ? v.bind(t) : v
          },
        })
        foe.ctrl = wrap
        // pixelate flicker while scrambled
        for (let i = 1; i <= 5; i++) ctx.after(i * 22, () => foe.flash?.(0xb45cff, 5))
        ctx.revert(120, () => { if (foe.ctrl === wrap) foe.ctrl = orig })
        ctx.after(122, () => ctx.end())
      },
    },
    {
      kind: 'pixel-sword', name: 'PIXEL SWORD', tier: 5,
      ai: { type: 'melee', range: 3 },
      build() {
        const g = new THREE.Group()
        for (let i = 0; i < 5; i++) g.add(at(bx(0.1, 0.1, 0.04, i % 2 ? C.green : C.blue), 0, 0.06 + i * 0.1, 0))
        g.add(at(bx(0.24, 0.08, 0.06, C.dark), 0, -0.05, 0))
        g.add(at(bx(0.07, 0.14, 0.05, C.dark), 0, -0.16, 0))
        return g
      },
      effect(ctx) {
        ctx.sfx('glitch', { pitch: 1.3 }); ctx.sfx('whoosh', { pitch: 0.7 })
        ctx.after(7, () => {
          if (ctx.foeInFront(3.1)) {
            ctx.hit({ damage: 15, knockback: { x: 8, y: 6, spin: 1.5 } })
            ctx.sfx('punch_heavy')
            ctx.caption('HP CHUNK DELETED')
            // the deleted hp leaves as little cubes
            ctx.burst('confetti', ctx.foeChest(), { n: 26 })
            ctx.shake(0.9)
          }
          ctx.end()
        })
      },
    },
    {
      kind: 'right-click-ray', name: 'RIGHT-CLICK RAY', tier: 5,
      ai: { type: 'any', range: 9 },
      build() {
        const body = cyl(0.07, 0.1, 0.36, C.grey, 8)
        body.rotation.z = Math.PI / 2
        const ring = at(torus(0.11, 0.02, C.blue, 5, 10), 0.14, 0, 0, 0, Math.PI / 2)
        return grp(body, ring)
      },
      effect(ctx) {
        // mints a decoy copy of YOU (a framed jpeg, honestly) that distracts the foe
        ctx.sfx('glitch', { pitch: 0.8 })
        ctx.caption('RIGHT-CLICK SAVED')
        const foe = ctx.foe, self = ctx.self
        const px = ctx.clampX(foe.pos.x + ctx.dir * 2)
        const decoy = grp(
          at(bx(1, 1.5, 0.08, C.gold), 0, 0.9, 0),                     // gilded frame
          at(bx(0.84, 1.34, 0.06, C.dark), 0, 0.9, 0.03),
          at(bx(0.4, 0.6, 0.05, C.grey), 0, 1, 0.07),                  // "you"
          at(sph(0.18, C.grey, 6), 0, 1.5, 0.07),
        )
        decoy.position.set(px, 0, 0)
        ctx.addMesh(decoy)
        ctx.burst('sparks', { x: px, y: 1, z: 0 }, { n: 10 })
        foe.speedMult = 0.5 // transfixed by the copy
        self.invuln = Math.max(self.invuln || 0, 90)
        ctx.revert(180, () => { foe.speedMult = 1 })
        ctx.after(180, () => {
          ctx.burst('confetti', { x: px, y: 1, z: 0 }, { n: 10 })
          ctx.removeMesh(decoy)
          ctx.end()
        })
      },
    },
  ],

  // ===== T6 INSTITUTIONAL CAPITAL TOWER — corporate weaponry =================
  [
    {
      kind: 'margin-call-phone', name: 'MARGIN-CALL PHONE', tier: 6,
      ai: { type: 'any', range: 9 },
      build() {
        const base = bx(0.3, 0.12, 0.2, C.red)
        const handset = at(bx(0.32, 0.07, 0.09, C.dark), 0, 0.14, 0)
        const dial = at(cyl(0.06, 0.06, 0.02, C.white), 0.04, 0.07, 0.06, Math.PI / 2)
        return grp(base, handset, dial)
      },
      effect(ctx) {
        const foe = ctx.foe
        ctx.sfx('bell', { pitch: 1.6, vol: 0.6 })
        ctx.after(12, () => ctx.sfx('bell', { pitch: 1.6, vol: 0.6 }))
        ctx.after(24, () => {
          ctx.caption('MARGIN CALL')
          ctx.sfx('klaxon', { vol: 0.5 })
          if (!foe.isInvulnerable?.()) {
            ctx.hitstun(foe, 72, true) // they have to take this
            foe.flash?.(0xff4d5e, 20)
            ctx.burst('stars', ctx.foeChest(), { n: 8 })
          }
          ctx.end()
        })
      },
    },
    {
      kind: 'golden-parachute', name: 'GOLDEN PARACHUTE', tier: 6,
      ai: { type: 'self' },
      build() {
        const pack = bx(0.3, 0.36, 0.16, C.gold)
        const strapL = at(bx(0.05, 0.36, 0.18, C.brown), -0.11, 0, 0)
        const strapR = at(bx(0.05, 0.36, 0.18, C.brown), 0.11, 0, 0)
        return grp(pack, strapL, strapR)
      },
      effect(ctx) {
        const self = ctx.self
        ctx.heal(self, 10)
        ctx.sfx('coin'); ctx.caption('EXIT PACKAGE SECURED')
        let canopy = null, armed = true
        const finish = () => {
          if (canopy) { ctx.removeMesh(canopy); canopy = null }
          armed = false
          ctx.end()
        }
        ctx.cleanup(finish)
        let watch = 0
        ctx.frame(() => {
          watch++
          if (!armed) return
          if (canopy) {
            // gentle float: fall speed capped, drift damped
            self.vel.y = Math.max(self.vel.y, -1.4)
            self.vel.x *= 0.985
            canopy.position.set(self.pos.x, self.pos.y + 2.6, 0)
            if (self.grounded?.() || (self.state !== 'launched' && self.state !== 'jump')) finish()
            return
          }
          if (self.state === 'launched') {
            canopy = grp(
              at(sph(0.8, C.gold, 8), 0, 0, 0),
              at(bx(0.03, 1.2, 0.03, C.brown), -0.5, -0.7, 0),
              at(bx(0.03, 1.2, 0.03, C.brown), 0.5, -0.7, 0),
            )
            canopy.children[0].scale.y = 0.55
            ctx.addMesh(canopy)
            ctx.sfx('boing', { pitch: 0.7 })
            ctx.caption('GOLDEN PARACHUTE')
          }
          if (watch > 480) finish() // offer expires
        })
      },
    },
    {
      kind: 'severance-briefcase', name: 'SEVERANCE BRIEFCASE', tier: 6,
      ai: { type: 'ranged', range: 7 },
      build() {
        const case_ = bx(0.4, 0.28, 0.12, C.brown)
        const handle = at(torus(0.07, 0.02, C.dark, 5, 8), 0, 0.18, 0)
        const clasp = at(bx(0.06, 0.04, 0.02, C.gold), 0.1, 0.1, 0.06)
        return grp(case_, handle, clasp)
      },
      effect(ctx) {
        ctx.sfx('throw')
        ctx.projectile({
          mesh: grp(bx(0.38, 0.26, 0.12, C.brown)), y: 1.4, vx: ctx.dir * 12, vy: 1.5, grav: -18, spin: 8,
          onHit(f) {
            ctx.sfx('explosion', { vol: 0.8 }); ctx.sfx('coins_burst')
            ctx.caption('SEVERED!')
            ctx.shake(1)
            ctx.hit({ damage: 13, knockback: { x: 12, y: 8, spin: 2 } })
            ctx.burst('confetti', ctx.foeChest(), { n: 30 }) // shredded NDAs
            ctx.burst('coins', ctx.foeChest(), { n: 14 })
          },
          onLand(x) { ctx.sfx('thud'); ctx.burst('coins', { x, y: 0.4, z: 0 }, { n: 6 }) },
        })
        ctx.after(100, () => ctx.end())
      },
    },
  ],

  // ===== T7 CALM BEFORE LIQUIDATION — weaponized serenity ====================
  [
    {
      kind: 'zen-bell', name: 'WEAPONIZED ZEN BELL', tier: 7,
      ai: { type: 'any', range: 9 },
      build() {
        const bell = cyl(0.12, 0.22, 0.26, C.gold, 10)
        const knob = at(sph(0.05, C.wood, 5), 0, 0.18, 0)
        return grp(bell, knob)
      },
      effect(ctx) {
        ctx.sfx('bell', { pitch: 0.8 })
        ctx.caption('OMMMMM.')
        ringWave(ctx, { x: ctx.self.pos.x, y: 0.6 }, C.white, { to: 14, life: 40 })
        ctx.foe.gainMeter?.(-30) // aggressively at peace
        ctx.foe.speedMult = 0.8
        ctx.revert(90, () => { ctx.foe.speedMult = 1 })
        ctx.burst('smoke', ctx.foeChest(), { n: 6 })
        ctx.after(92, () => ctx.end())
      },
    },
    {
      kind: 'picnic-basket', name: 'EXPLODING PICNIC BASKET', tier: 7,
      ai: { type: 'trap', range: 4 },
      build() {
        const basket = bx(0.36, 0.2, 0.24, C.wood)
        const blanket = at(bx(0.38, 0.03, 0.26, C.red), 0, 0.12, 0)
        const lid = at(bx(0.18, 0.04, 0.24, C.tan), -0.1, 0.16, 0, 0, 0, 0.3)
        return grp(basket, blanket, lid)
      },
      effect(ctx) {
        const x = ctx.clampX(ctx.self.pos.x + ctx.dir * 1.6)
        const basket = grp(bx(0.34, 0.18, 0.22, C.wood), at(bx(0.36, 0.03, 0.24, C.red), 0, 0.11, 0))
        basket.position.set(x, 0.12, 0)
        ctx.addMesh(basket)
        ctx.sfx('menu_confirm', { vol: 0.3 })
        ctx.caption('LOVELY SPOT FOR IT.')
        let armed = false, age = 0
        ctx.after(45, () => { armed = true })
        ctx.frame(() => {
          age++
          if (armed) basket.visible = (age >> 3) % 4 !== 3 // idle simmer blink
          const foe = ctx.foe
          if (armed && Math.abs(foe.pos.x - x) < 1.3 && foe.grounded?.() && !foe.isInvulnerable?.()) {
            ctx.sfx('explosion'); ctx.shake(1)
            ctx.burst('explosion', { x, y: 0.5, z: 0 })
            ctx.burst('confetti', { x, y: 1, z: 0 }, { n: 12 }) // sandwiches, everywhere
            ctx.hit({ damage: 12, knockback: { x: 9, y: 9, spin: 2 }, pos: { x, y: 0.8 } })
            ctx.removeMesh(basket)
            ctx.end()
          } else if (age > 480) {
            ctx.burst('smoke', { x, y: 0.3, z: 0 }, { n: 4 })
            ctx.removeMesh(basket)
            ctx.end()
          }
        })
      },
    },
    {
      kind: 'grass-patch', name: 'GRASS PATCH', tier: 7,
      ai: { type: 'ranged', range: 8 },
      build() {
        const sod = bx(0.36, 0.06, 0.3, C.brown)
        const g = grp(sod)
        for (let i = 0; i < 5; i++) g.add(at(cone(0.03, 0.16, C.green, 4), -0.12 + i * 0.06, 0.1, (i % 2) * 0.08 - 0.04))
        return g
      },
      effect(ctx) {
        ctx.sfx('throw')
        ctx.projectile({
          mesh: grp(bx(0.34, 0.06, 0.28, C.brown), at(cone(0.03, 0.16, C.green, 4), 0, 0.1, 0)),
          y: 1.4, vx: ctx.dir * 10, vy: 2.5, grav: -22, spin: 4,
          onHit(f) {
            ctx.caption('TOUCH GRASS')
            ctx.sfx('geyser', { pitch: 1.4, vol: 0.5 })
            ctx.burst('stars', { x: f.pos.x, y: 0.4, z: 0 }, { n: 8 })
            f.speedMult = 0
            f.vel.x = 0
            ctx.revert(90, () => { f.speedMult = 1 })
          },
        })
        ctx.after(200, () => ctx.end())
      },
    },
  ],

  // ===== T8 BULL MARKET COLOSSEUM — gladiator kit ============================
  [
    {
      kind: 'gladius-of-gains', name: 'GLADIUS OF GAINS', tier: 8,
      ai: { type: 'melee', range: 3 },
      build() {
        const blade = bx(0.08, 0.55, 0.03, C.steel)
        const tip = at(cone(0.055, 0.12, C.steel, 4), 0, 0.33, 0)
        const guard = at(bx(0.24, 0.05, 0.06, C.gold), 0, -0.28, 0)
        const grip = at(cyl(0.035, 0.035, 0.16, C.brown), 0, -0.38, 0)
        return grp(blade, tip, guard, grip)
      },
      effect(ctx) {
        // three heavy swings, escalating
        ctx.caption('GAINS!')
        const swing = (dmg, kb, last) => {
          ctx.sfx('whoosh', { pitch: last ? 0.6 : 0.9 })
          if (ctx.foeInFront(3)) {
            ctx.hit({ damage: dmg, knockback: last ? kb : { x: 3, y: 0 }, hitStun: 18 })
            ctx.sfx(last ? 'punch_heavy' : 'punch_light')
            ctx.burst('sparks', ctx.foeChest())
            if (last) ctx.shake(0.9)
          }
        }
        ctx.after(6, () => swing(6))
        ctx.after(20, () => swing(6))
        ctx.after(36, () => { swing(9, { x: 11, y: 7, spin: 2 }, true); ctx.end() })
      },
    },
    {
      kind: 'bull-horn', name: 'BULL HORN', tier: 8,
      ai: { type: 'any', range: 9 },
      build() {
        const horn = cyl(0.05, 0.13, 0.5, C.cream, 8)
        horn.rotation.z = Math.PI / 2.4
        const band = at(torus(0.12, 0.025, C.gold, 5, 10), 0.16, -0.14, 0, 0, 0, Math.PI / 2.4)
        return grp(horn, band)
      },
      effect(ctx) {
        ctx.sfx('moo', { pitch: 0.8 })
        ctx.caption('BULL RUN!')
        const dir = ctx.dir, b = ctx.bounds
        const bull = grp(
          bx(1.1, 0.6, 0.5, C.brown),
          at(sph(0.28, C.brown, 6), 0.62, 0.12, 0),
          at(cone(0.05, 0.2, C.cream, 5), 0.75, 0.36, 0.12, 0.4),
          at(cone(0.05, 0.2, C.cream, 5), 0.75, 0.36, -0.12, -0.4),
        )
        bull.position.set(dir > 0 ? b.minX - 1.2 : b.maxX + 1.2, 0.45, 0)
        if (dir < 0) bull.rotation.y = Math.PI
        ctx.addMesh(bull)
        let hitDone = false
        ctx.after(20, () => {
          ctx.frame(() => {
            bull.position.x += dir * 13 / 60
            bull.position.y = 0.45 + Math.abs(Math.sin(ctx.frameAge * 0.35)) * 0.12
            if ((ctx.frameAge & 7) === 0) ctx.burst('dust', { x: bull.position.x - dir * 0.6, y: 0.15, z: 0 }, { n: 3 })
            const foe = ctx.foe
            if (!hitDone && Math.abs(foe.pos.x - bull.position.x) < 1 && foe.pos.y < 1.4 && !foe.isInvulnerable?.()) {
              hitDone = true
              ctx.sfx('thud'); ctx.sfx('moo', { pitch: 1.2 }); ctx.shake(0.9)
              ctx.hit({ damage: 10, knockback: { x: 11, y: 7, spin: 2.5 } })
            }
            if (bull.position.x < b.minX - 2 || bull.position.x > b.maxX + 2) { ctx.removeMesh(bull); ctx.end() }
          })
        })
      },
    },
    {
      kind: 'thumbs-down-medallion', name: 'THUMBS-DOWN MEDALLION', tier: 8,
      ai: { type: 'any', range: 9 },
      build() {
        const disc = cyl(0.2, 0.2, 0.04, C.gold, 12)
        disc.rotation.x = Math.PI / 2
        const thumb = at(bx(0.08, 0.16, 0.05, C.red), 0, -0.02, 0.03)
        const nub = at(bx(0.1, 0.06, 0.05, C.red), -0.07, 0.06, 0.03)
        return grp(disc, thumb, nub)
      },
      effect(ctx) {
        // the crowd has decided: the foe's next hit taken is a counter-crit
        const foe = ctx.foe
        ctx.sfx('boss_sting', { vol: 0.6 })
        ctx.caption('THE CROWD HAS SPOKEN')
        const mark = grp(at(bx(0.16, 0.3, 0.08, C.red), 0, 0, 0), at(bx(0.2, 0.12, 0.08, C.red), -0.14, 0.16, 0))
        ctx.addMesh(mark)
        let applying = false, doneOnce = false
        const off = ctx.events?.on?.('fighter:hit', (e) => {
          if (doneOnce || applying || !e || e.slot !== foe.slot) return
          applying = true
          ctx.caption('COUNTER-CRIT!')
          ctx.sfx('crack'); ctx.shake(0.8)
          foe.setHp?.(Math.max(1, foe.hp - 8))
          foe.flash?.(0xff4d5e, 6)
          ctx.burst('stars', ctx.foeChest(), { n: 10 })
          applying = false
          finish()
        })
        const finish = () => {
          if (doneOnce) return
          doneOnce = true
          off?.()
          ctx.removeMesh(mark)
          ctx.end()
        }
        ctx.cleanup(finish)
        ctx.frame(() => {
          mark.position.set(foe.pos.x, foe.pos.y + (foe.def?.height ?? 1.8) + 0.5 + Math.sin(ctx.frameAge * 0.1) * 0.08, 0)
          mark.rotation.y += 0.04
        })
        ctx.after(600, finish) // verdict expires
      },
    },
  ],

  // ===== T9 PERMANENT RESERVE CORE — reality-breaking ========================
  [
    {
      kind: 'god-candle-bazooka', name: 'GOD CANDLE BAZOOKA', tier: 9,
      ai: { type: 'ranged', range: 10 },
      build() {
        const tube = cyl(0.11, 0.11, 0.7, C.dark, 8)
        tube.rotation.z = Math.PI / 2
        const muzzle = at(cyl(0.13, 0.13, 0.1, C.green, 8), 0.35, 0, 0, 0, 0, Math.PI / 2)
        const grip = at(bx(0.06, 0.16, 0.06, C.green), -0.1, -0.14, 0)
        return grp(tube, muzzle, grip)
      },
      effect(ctx) {
        ctx.sfx('launch')
        ctx.shake(0.5)
        const candle = grp(bx(0.28, 0.9, 0.28, C.green), at(bx(0.06, 1.3, 0.06, 0x1f9151), 0, 0, 0))
        candle.rotation.z = -ctx.dir * Math.PI / 2
        ctx.projectile({
          mesh: candle, y: 1.5, vx: ctx.dir * 18, spin: 0, radius: 1,
          update(m) { if ((ctx.frameAge & 1) === 0) ctx.burst('sparks', { x: m.position.x - ctx.dir * 0.6, y: m.position.y, z: 0 }, { n: 3 }) },
          onHit(f) {
            ctx.sfx('explosion'); ctx.shake(1.5)
            ctx.caption('GOD CANDLE.')
            ctx.slowmo(0.35, 0.8)
            ctx.burst('explosion', ctx.foeChest())
            ctx.hit({ damage: 16, knockback: { x: 14, y: 13, spin: 3 }, ragdoll: 2 })
          },
          onExpire(x, y) { ctx.sfx('explosion', { vol: 0.6 }); ctx.burst('explosion', { x, y, z: 0 }) },
        })
        ctx.after(90, () => ctx.end())
      },
    },
    {
      kind: 'money-printer', name: 'MONEY PRINTER', tier: 9,
      ai: { type: 'melee', range: 3.5 },
      build() {
        const body = bx(0.42, 0.24, 0.3, C.grey)
        const slot = at(bx(0.44, 0.03, 0.1, C.dark), 0, 0.13, 0)
        const bill = at(bx(0.2, 0.01, 0.12, C.green), 0, 0.16, 0)
        const light = at(sph(0.04, C.red, 5, { emissive: 0x881111 }), 0.16, 0.14, 0.12)
        return grp(body, slot, bill, light)
      },
      effect(ctx) {
        const self = ctx.self
        const fountainX = ctx.clampX(self.pos.x + ctx.dir * 1.1)
        ctx.sfx('surge', { vol: 0.7 })
        ctx.caption('BRRRRRRRR')
        // the printer stays; the user does not (recoil is monetary policy)
        const printer = grp(bx(0.42, 0.24, 0.3, C.grey), at(bx(0.44, 0.03, 0.1, C.dark), 0, 0.13, 0))
        printer.position.set(fountainX, 0.15, 0)
        ctx.addMesh(printer)
        ctx.launch(self, -ctx.dir * 8, 4.5, 1)
        let tick = 0
        ctx.frame(() => {
          tick++
          if (tick % 6 === 0) { ctx.burst('coins', { x: fountainX, y: 0.5, z: 0 }, { n: 5 }); ctx.sfx('coin', { vol: 0.3, pitch: 1 + Math.random() * 0.4 }) }
          const foe = ctx.foe
          if (tick % 12 === 0 && Math.abs(foe.pos.x - fountainX) < 1.8 && !foe.isInvulnerable?.()) {
            ctx.hit({ damage: 2, hitStun: 10, pos: { x: fountainX, y: 1 } }) // pelted by liquidity
          }
          if (tick >= 90) { ctx.removeMesh(printer); ctx.burst('coins', { x: fountainX, y: 0.5, z: 0 }, { n: 10 }); ctx.end() }
        })
      },
    },
    {
      kind: 'tactical-moon', name: 'TACTICAL MOON', tier: 9,
      ai: { type: 'any', range: 9 },
      build() {
        const moon = sph(0.24, C.grey, 9)
        const c1 = at(sph(0.05, 0x707684, 5), 0.12, 0.14, 0.12)
        const c2 = at(sph(0.07, 0x707684, 5), -0.1, -0.05, 0.18)
        return grp(moon, c1, c2)
      },
      effect(ctx) {
        ctx.sfx('throw')
        const moonMesh = grp(sph(0.22, C.grey, 9))
        const engage = (x, y) => {
          ctx.sfx('surge'); ctx.shake(0.5)
          ctx.caption('TO THE MOON')
          ctx.burst('stars', { x, y: Math.max(1, y), z: 0 }, { n: 14 })
          // the moon ascends to its post
          moonMesh.position.set(x, Math.max(1, y), 0)
          ctx.addMesh(moonMesh)
          // gravity flips to 30% for EVERYONE for 2.5s
          const w = ctx.physics?.world
          let savedG = null
          if (w?.gravity && Number.isFinite(w.gravity.y)) { savedG = w.gravity.y; w.gravity.y = savedG * 0.3 }
          ctx.revert(150, () => { if (savedG != null && w?.gravity) w.gravity.y = savedG })
          // a little liftoff for anyone on the ground
          for (const f of ctx.fighters) if (f.grounded?.() && !f.isInvulnerable?.()) f.vel.y = 4.5
          let f2 = 0
          ctx.frame(() => {
            f2++
            moonMesh.position.y += 0.02
            moonMesh.rotation.y += 0.03
            // fighters use a baked-in gravity constant; per-frame compensation
            // yields net ~30% while airborne (restore-safe: stops with the effect)
            for (const f of ctx.fighters) {
              if (f.pos.y > 0.001 && f.state !== 'ragdoll') f.vel.y += (22 * 0.7) / 60
            }
            if (f2 >= 150) {
              ctx.removeMesh(moonMesh)
              ctx.burst('smoke', { x: moonMesh.position.x, y: moonMesh.position.y, z: 0 }, { n: 5 })
              ctx.end()
            }
          })
        }
        ctx.projectile({
          mesh: moonMesh, y: 1.5, vx: ctx.dir * 9, vy: 3, grav: -18, spin: 3, keepMesh: true,
          onHit(f) { ctx.hit({ damage: 5 }); engage(f.pos.x, 1.5); return true },
          onLand(x) { engage(x, 0.5); return true },
        })
      },
    },
    {
      kind: 'reserve-key', name: 'PERMANENT RESERVE KEY', tier: 9,
      ai: { type: 'self' },
      build() {
        const bow = torus(0.12, 0.035, C.gold, 6, 10)
        const stem = at(cyl(0.035, 0.035, 0.4, C.gold), 0, -0.28, 0)
        const t1 = at(bx(0.1, 0.05, 0.05, C.gold), 0.06, -0.42, 0)
        const t2 = at(bx(0.07, 0.05, 0.05, C.gold), 0.05, -0.34, 0)
        return grp(bow, stem, t1, t2)
      },
      effect(ctx) {
        ctx.sfx('surge'); ctx.sfx('fanfare', { vol: 0.7 })
        ctx.caption('RESERVES: PERMANENT')
        ctx.shake(1)
        for (const f of ctx.fighters) {
          f.gainMeter?.(100) // both fighters. chaos is monetary policy
          ctx.burst('coins', { x: f.pos.x, y: f.pos.y + 1.2, z: 0 }, { n: 10 })
          ctx.burst('confetti', { x: f.pos.x, y: f.pos.y + 1.6, z: 0 }, { n: 14 })
        }
        ringWave(ctx, { x: (ctx.self.pos.x + ctx.foe.pos.x) / 2, y: 0.4 }, C.gold, { to: 16, life: 44 })
        try { ctx.arena?.surge?.() } catch { /* arena hook optional */ }
        ctx.after(20, () => ctx.end())
      },
    },
  ],
]

// ---------------------------------------------------------------- lookups
// Tier by arena id — mirrors ArenaOrder in src/arenas/index.js (kept local so
// the item module never has to import the whole arena registry; headless tests
// and tree-shaking both thank us). Unknown ids fall back to tier 0.
export const TIER_BY_ARENA = {
  'meme-market': 0,
  'liquidity-swamp': 1,
  'frozen-token-lab': 2,
  'settlement-express': 3,
  'mountain-node-village': 4,
  'lost-block-museum': 5,
  'institutional-capital-tower': 6,
  'calm-before-liquidation': 7,
  'bull-market-colosseum': 8,
  'permanent-reserve-core': 9,
}

const BY_KIND = new Map()
for (const tierList of ITEM_ROSTER) for (const def of tierList) BY_KIND.set(def.kind, def)

export function rosterForTier(tier) {
  return ITEM_ROSTER[Math.max(0, Math.min(ITEM_ROSTER.length - 1, tier | 0))]
}
export function rosterForArena(arenaId) {
  return rosterForTier(TIER_BY_ARENA[arenaId] ?? 0)
}
export function itemDefByKind(kind) {
  return BY_KIND.get(kind) || null
}
export function allItemKinds() {
  return [...BY_KIND.keys()]
}
