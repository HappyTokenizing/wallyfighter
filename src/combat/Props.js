// Prop factory + lifetime manager for SpecialContext.spawnProp. Low-poly primitive
// props registered with PhysicsManager.addProp. Kinds per CONTRACTS.md §6:
// coin, crate, vaultDoor, rocket, candle, chair, monitor, box.
//
// Builders receive the caller's opts and honor:
//   opts.color  hex number — recolors the primary material (accents auto-darken)
//   opts.size   [w, h, d] meters — resizes the primary geometry (box-family kinds;
//               coin reads [diameter, thickness], rocket [diameter, length])
//   opts.scale  number — uniform rescale of the whole prop
// PhysicsManager.addProp derives collision half-extents from the mesh's world
// bounding box, so authored sizes/scales carry into the physics body for free.
// Mass auto-scales with volume when the caller didn't pin opts.mass.
import * as THREE from 'three'

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra })
}

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
}

// [w,h,d] from opts.size with per-axis fallbacks to the builder's defaults.
function dims(opts, dw, dh, dd) {
  const s = Array.isArray(opts?.size) ? opts.size : null
  const n = (v, def) => (Number.isFinite(v) && v > 0 ? v : def)
  return [n(s?.[0], dw), n(s?.[1], dh), n(s?.[2], dd)]
}

function tint(opts, def) {
  return typeof opts?.color === 'number' ? opts.color : def
}

const _c = new THREE.Color()
function darken(hex, f) {
  return _c.setHex(hex).multiplyScalar(f).getHex()
}

// Each builder returns { mesh, shape, mass, breakable, health, volumeScale? }
// volumeScale = authored volume / default volume (drives mass auto-scaling).
const BUILDERS = {
  coin(opts = {}) {
    const [dia, thick] = dims(opts, 0.48, 0.07, 0.48)
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(dia / 2, dia / 2, thick, 10),
      mat(tint(opts, 0xffcf3f))
    )
    m.rotation.z = Math.PI / 2
    return {
      mesh: m, shape: 'cylinder', mass: 0.4,
      volumeScale: (dia * dia * thick) / (0.48 * 0.48 * 0.07),
    }
  },
  crate(opts = {}) {
    const [w, h, d] = dims(opts, 0.72, 0.72, 0.72)
    const color = tint(opts, 0xb07a3c)
    const m = box(w, h, d, color)
    const band = box(w + 0.04, h * 0.19, d + 0.04,
      typeof opts.color === 'number' ? darken(color, 0.66) : 0x7d5426)
    m.add(band)
    return {
      mesh: m, shape: 'box', mass: 3, breakable: true, health: 12,
      volumeScale: (w * h * d) / (0.72 * 0.72 * 0.72),
    }
  },
  vaultDoor(opts = {}) {
    const [w, h, d] = dims(opts, 0.22, 2.1, 1.5)
    const color = tint(opts, 0x8a93a6)
    const m = box(w, h, d, color)
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(h * 0.162, h * 0.033, 6, 10),
      mat(typeof opts.color === 'number' ? darken(color, 0.66) : 0x5b6270)
    )
    wheel.rotation.y = Math.PI / 2
    wheel.position.x = w * 0.73
    m.add(wheel)
    return {
      mesh: m, shape: 'box', mass: 16,
      volumeScale: (w * h * d) / (0.22 * 2.1 * 1.5),
    }
  },
  rocket(opts = {}) {
    const [dia, len] = dims(opts, 0.44, 1.1, 0.44)
    const r = dia / 2
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat(tint(opts, 0xe8ecf2)))
    const nose = new THREE.Mesh(new THREE.ConeGeometry(r, len * 0.36, 8), mat(0xff4d5e))
    nose.position.y = len * 0.68
    m.add(nose)
    for (let i = 0; i < 3; i++) {
      const fin = box(dia * 0.11, len * 0.27, dia * 0.55, 0xff4d5e)
      const a = (i / 3) * Math.PI * 2
      fin.position.set(Math.cos(a) * r, -len * 0.41, Math.sin(a) * r)
      fin.rotation.y = -a
      m.add(fin)
    }
    return {
      mesh: m, shape: 'cylinder', mass: 2.5,
      volumeScale: (dia * dia * len) / (0.44 * 0.44 * 1.1),
    }
  },
  candle(opts = {}) {
    // a chart candlestick, obviously — 60/40 green/red unless the caller says otherwise
    const [w, h, d] = dims(opts, 0.34, 1.25, 0.34)
    let bodyColor, wickColor
    if (typeof opts.color === 'number') {
      bodyColor = opts.color
      wickColor = darken(opts.color, 0.6)
    } else {
      const up = Math.random() > 0.4
      bodyColor = up ? 0x37e07a : 0xff4d5e
      wickColor = up ? 0x1f9151 : 0xa62c3a
    }
    const m = box(w, h, d, bodyColor)
    const wick = box(w * 0.18, h * 1.52, w * 0.18, wickColor)
    m.add(wick)
    return {
      mesh: m, shape: 'box', mass: 2, breakable: true, health: 8,
      volumeScale: (w * h * d) / (0.34 * 1.25 * 0.34),
    }
  },
  chair(opts = {}) {
    const color = tint(opts, 0x3d4250)
    const seat = box(0.55, 0.09, 0.55, color)
    const back = box(0.55, 0.62, 0.09, color)
    back.position.set(0, 0.35, -0.24)
    seat.add(back)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), mat(0x8a93a6))
    pole.position.y = -0.3
    seat.add(pole)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8), mat(0x2a2e38))
    base.position.y = -0.55
    seat.add(base)
    return { mesh: seat, shape: 'box', mass: 4, breakable: true, health: 10 }
  },
  monitor(opts = {}) {
    const [w, h, d] = dims(opts, 0.1, 0.55, 0.85)
    const m = box(w, h, d, tint(opts, 0x22242c))
    const screen = box(w * 0.3, h * 0.82, d * 0.88, 0x0a3d1f)
    screen.position.x = w * 0.6
    const line = box(w * 0.2, h * 0.09, d * 0.7, 0x37e07a)
    line.position.x = w * 0.8
    line.rotation.x = -0.4
    m.add(screen)
    m.add(line)
    return {
      mesh: m, shape: 'box', mass: 2.2, breakable: true, health: 6,
      volumeScale: (w * h * d) / (0.1 * 0.55 * 0.85),
    }
  },
  box(opts = {}) {
    const [w, h, d] = dims(opts, 0.6, 0.6, 0.6)
    const m = box(w, h, d, tint(opts, 0xc9a166))
    return {
      mesh: m, shape: 'box', mass: 1.6, breakable: true, health: 6,
      volumeScale: (w * h * d) / (0.6 * 0.6 * 0.6),
    }
  },
}

export class PropManager {
  constructor(scene, physics) {
    this.scene = scene
    this.physics = physics
    this.records = []
  }

  spawn(kind, pos, opts = {}) {
    const builder = BUILDERS[kind] || BUILDERS.box
    let spec
    try { spec = builder(opts) } catch (e) { console.warn('[combat] prop build failed', kind, e); return null }
    const mesh = spec.mesh
    const scale = Number(opts.scale)
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) mesh.scale.multiplyScalar(scale)
    mesh.castShadow = true
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
    if (pos) mesh.position.set(pos.x || 0, pos.y ?? 1, pos.z || 0)
    this.scene.add(mesh)
    // Heavier when built bigger, lighter when built smaller — unless the caller pinned mass.
    let mass = opts.mass
    if (mass == null) {
      mass = spec.mass
      let vs = spec.volumeScale ?? 1
      if (Number.isFinite(scale) && scale > 0) vs *= scale * scale * scale
      if (vs !== 1 && Number.isFinite(vs) && vs > 0) {
        mass *= Math.min(12, Math.max(0.12, vs))
      }
    }
    let handle = null
    try {
      handle = this.physics.addProp(mesh, {
        shape: spec.shape,
        kind,
        mass,
        breakable: opts.breakable ?? spec.breakable ?? false,
        health: opts.health ?? spec.health ?? 10,
        velocity: opts.velocity,
      })
    } catch (e) { console.warn('[combat] addProp failed', e) }
    if (handle && opts.impulse) {
      try { this.physics.impulse(handle, opts.impulse) } catch { /* stub-safe */ }
    }
    const record = { mesh, handle }
    this.records.push(record)
    return handle || { mesh, body: null, break() {}, remove: () => this._remove(record) }
  }

  _remove(record) {
    const i = this.records.indexOf(record)
    if (i === -1) return
    this.records.splice(i, 1)
    try { record.handle?.remove?.() } catch { /* ignore */ }
    this.scene.remove(record.mesh)
    record.mesh.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.() }
    })
  }

  update() {
    // cull anything that fell out of the world
    for (let i = this.records.length - 1; i >= 0; i--) {
      const r = this.records[i]
      if (!r.mesh.parent || r.mesh.position.y < -30 || Math.abs(r.mesh.position.x) > 80) {
        this._remove(r)
      }
    }
  }

  dispose() {
    for (let i = this.records.length - 1; i >= 0; i--) this._remove(this.records[i])
  }
}
