// ---------------------------------------------------------------------------
// PortraitStudio — offscreen 3D character photography for the front-end cards.
//
// WHY THIS EXISTS
// The select grid, the select panels, the gallery, the VS splash and the match
// card all showed the same 96x96 hand-drawn `drawPortrait()` doodle. The roster
// underneath them is now fully PBR-surfaced (vinyl, hide, fur, cloth, gold) and
// NONE of that was visible anywhere outside a fight — a menu frame looked two
// generations behind a gameplay frame, which is exactly the complaint.
//
// This module bakes a real portrait: the character's actual `buildModel()`,
// upgraded through `upgradeMaterials()`, lit by `makeCinematicRig()` under a
// PMREM environment from `applyEnvironment()`, standing on a plinth that catches
// its own shadow, tone-mapped and graded through a small filmic pass, and
// composited onto a designed backdrop. The result is cached as a plain canvas
// and blitted into whatever <canvas> the screen already had, so:
//
//   * no DOM changes, no layout changes, no CSS changes, no navigation changes
//   * every draw is one-time — zero per-frame cost after the bake
//   * every failure path falls back to the old `drawPortrait()` doodle
//
// GRAPHICS_CONTRACT §8 note: bakes go through `renderer.render()` directly and
// NOT through `renderScene()`. A bake is not a frame — it renders into its own
// WebGLRenderTarget, off-screen, and needs the linear buffer for its own filmic
// pass. The on-screen frame still goes through the pipeline untouched, and the
// renderer's render target is restored before we return.
// ---------------------------------------------------------------------------
import * as THREE from 'three'
import { Characters } from '../../characters/index.js'
import { Animator } from '../../combat/Animator.js'
import {
  pbr, applyEnvironment, makeCinematicRig, upgradeMaterials,
  disposeMaterialSafely, isSharedMaterial, isSharedGeometry, GEO,
} from '../../render/index.js'
import { drawPortrait } from '../uiKit.js'

// --------------------------------------------------------------- framings --
// Everything is square: every portrait <canvas> in ui.css is a square box.
// `visible` is the vertical slice of the model, in model heights, that fills the
// frame. `eye` is the height the camera looks at, also in model heights.
const FRAMING = {
  // full body on the plinth — silhouette, stance, contact shadow, all of it
  // `pitch` is the camera's slope above the point it looks at: negative is the
  // slight up-angle that makes a fighter look like a monument.
  hero: { size: 512, fov: 30, visible: 1.26, eye: 0.52, yaw: 0.62, pitch: -0.035, plinth: true },
  // head and chest — what a 90px roster thumbnail can actually resolve
  bust: { size: 320, fov: 24, visible: 0.58, eye: 0.815, yaw: 0.68, pitch: 0.05, plinth: false },
}

// ------------------------------------------------------------------ looks --
// One entry per card. `key/fill/rim` retint the cinematic rig; `bg` drives the
// 2D backdrop art; `grade` is the filmic pass.
const LOOK = {
  neutral: {
    mood: 'studio', envI: 1.0,
    key: 0xfff2e0, keyI: 3.0, fill: 0x8fb6e8, fillI: 0.70, rim: 0xa8d8ff, rimI: 3.0,
    // No stop is ever pure black: contract §0 keeps albedo out of 0 and the
    // pipeline's pctPureBlack metric off the floor. The grain pass carries the
    // last two code values so nothing bands.
    bg: { inner: '#3a1a68', outer: '#0e0a1e', ray: 'rgba(255,214,120,0.16)', floor: 'rgba(150,110,255,0.30)' },
    grade: { exposure: 1.06, contrast: 1.10, saturation: 1.06, tint: [1.0, 1.0, 1.0], bloom: 0.55 },
  },
  p1: {
    mood: 'studio', envI: 0.85,
    key: 0xfff0e2, keyI: 3.1, fill: 0xff7a6a, fillI: 0.62, rim: 0xff4b6a, rimI: 3.8,
    bg: { inner: '#5a1024', outer: '#16070e', ray: 'rgba(255,90,110,0.20)', floor: 'rgba(255,70,90,0.34)' },
    grade: { exposure: 1.08, contrast: 1.14, saturation: 1.08, tint: [1.04, 0.98, 0.97], bloom: 0.70 },
  },
  p2: {
    mood: 'studio', envI: 0.85,
    key: 0xeaf2ff, keyI: 3.1, fill: 0x6aa8ff, fillI: 0.66, rim: 0x4be0ff, rimI: 3.8,
    bg: { inner: '#0e2a66', outer: '#070d20', ray: 'rgba(90,190,255,0.20)', floor: 'rgba(70,180,255,0.34)' },
    grade: { exposure: 1.08, contrast: 1.14, saturation: 1.08, tint: [0.97, 0.99, 1.05], bloom: 0.70 },
  },
  gold: {
    mood: 'studio', envI: 1.0,
    key: 0xffe6b0, keyI: 3.4, fill: 0xffbe6a, fillI: 0.66, rim: 0xfff0c0, rimI: 4.0,
    bg: { inner: '#6a3a06', outer: '#181008', ray: 'rgba(255,214,74,0.30)', floor: 'rgba(255,190,60,0.42)' },
    grade: { exposure: 1.14, contrast: 1.12, saturation: 1.10, tint: [1.05, 1.0, 0.92], bloom: 0.95 },
  },
  defeat: {
    mood: 'studio', envI: 0.5,
    key: 0x9aa6b8, keyI: 1.5, fill: 0x54627a, fillI: 0.45, rim: 0x7f96b4, rimI: 1.6,
    bg: { inner: '#1c2230', outer: '#0a0d14', ray: 'rgba(140,160,190,0.08)', floor: 'rgba(90,110,140,0.20)' },
    grade: { exposure: 0.84, contrast: 1.06, saturation: 0.42, tint: [0.96, 0.98, 1.02], bloom: 0.15 },
  },
}

// Which animation frame flatters which pose. `t` is seconds into the clip —
// picked so the sampled frame is a peak, not a pass-through.
const POSE = {
  idle: { clip: ['idle'], t: 1.05 },
  ready: { clip: ['taunt', 'entrance', 'idle'], t: 0.55 },
  win: { clip: ['win', 'taunt', 'idle'], t: 0.95 },
  lose: { clip: ['lose', 'knockdown', 'idle'], t: 1.30 },
  entrance: { clip: ['entrance', 'taunt', 'idle'], t: 0.72 },
}

// --------------------------------------------------------------- shaders --
// Filmic resolve for the bake: unpremultiply, threshold-bloom, ACES, grade,
// sRGB encode. The bake target is linear half-float (three disables tone
// mapping and output encoding for every non-XR render target), so this pass is
// the ONLY place the portrait becomes displayable pixels.
const GRADE_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const GRADE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2  uTexel;
uniform float uExposure, uContrast, uSaturation, uBloom, uThreshold;
uniform vec3  uTint;

vec4 fetch(vec2 uv) {
  vec4 s = texture2D(tSrc, uv);
  // three blends into the target with premultiplied-style math; recover the
  // straight colour so the alpha edge does not darken when the browser
  // composites this over the 2D backdrop.
  return vec4(s.a > 0.0015 ? s.rgb / s.a : vec3(0.0), s.a);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec4 src = fetch(vUv);

  // 12-tap two-ring bright pass. Bake-time only, so a real gather is affordable
  // and the gold trim / rim light gets an actual bloom skirt instead of a clip.
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472;
    vec2 d = vec2(cos(a), sin(a)) * uTexel * 5.0;
    glow += max(fetch(vUv + d).rgb - uThreshold, vec3(0.0));
    vec2 d2 = vec2(cos(a + 0.5236), sin(a + 0.5236)) * uTexel * 13.0;
    glow += max(fetch(vUv + d2).rgb - uThreshold, vec3(0.0)) * 0.6;
  }
  glow *= uBloom / 12.0;

  float gl = clamp(dot(glow, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float outA = clamp(src.a + gl * 0.85, 0.0, 1.0);
  vec3 lin = (src.rgb * src.a + glow) / max(outA, 1e-4);

  vec3 col = aces(lin * uExposure * uTint);
  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = clamp(mix(vec3(lum), col, uSaturation), 0.0, 1.0);

  gl_FragColor = vec4(toSRGB(col), outA);
}
`

// ---------------------------------------------------------------------------
// The studio itself — one per session, built lazily on the first bake.
// ---------------------------------------------------------------------------

class Studio {
  constructor(game) {
    this.game = game
    this.renderer = game.renderer
    this.ok = false

    this.scene = new THREE.Scene()
    this.subject = new THREE.Group()
    this.subject.name = 'portraitSubject'
    this.scene.add(this.subject)

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80)

    // IBL first: metals (every fighter has gold, chrome or a lens somewhere)
    // render black without one, which is exactly why the old menu coin was a
    // flat yellow disc.
    this.env = applyEnvironment(this.scene, 'studio', this.renderer, { intensity: 1 })

    // Portrait-grade rig: key / fill / camera-relative rim / bounce, plus the
    // fresnel rim + specular key that give a stylised model its edge.
    // A portrait can afford the top shadow map whatever the tier is running:
    // it is drawn once, not sixty times a second. `shadows` itself stays the
    // tier's call — renderer.shadowMap.enabled is global state and toggling it
    // would recompile every material in the game.
    this.rig = makeCinematicRig(this.scene, { ...(this.game.quality || {}), shadowSize: 1024 }, {
      mood: 'studio',
      camera: this.camera,
      groundY: 0,
      follow: 60,              // no smoothing lag: every bake is a hard cut
      shadowRadius: 1.9,       // tight box == tiny texels == a real contact shadow
      shadowSoftness: 0.9,
      contactShadows: false,   // the plinth takes a real shadow-map shadow
      rimShader: true,
      rimShaderStrength: 0.55,
      rimYaw: -0.9,
      rimElevation: 0.42,
      subjectIntensity: 0.35,
      flicker: false,
      fog: false,               // a 2 m subject wants no depth cue from haze
    })
    // makeCinematicRig builds the group but leaves parenting to the caller
    // (lighting.js:1425 — it must hang off the scene ROOT for the shadow fit
    // and the camera-relative rim to be correct).
    if (this.rig?.group) this.scene.add(this.rig.group)
    this.lights = {
      key: this.rig.group?.getObjectByName('key') || null,
      fill: this.rig.group?.getObjectByName('fill') || null,
      rim: this.rig.group?.getObjectByName('rim') || null,
      hemi: this.rig.group?.getObjectByName('hemi') || null,
    }
    this._buildPlinth()
    this._buildResolvePass()

    this.targets = new Map()   // size -> { colour, resolve, buf }
    this.models = new Map()    // `${id}|${costume}` -> built model record
    this.ok = true
  }

  // A dark bevelled dais with a gold trim ring. It exists to catch the shadow —
  // a fighter floating on a gradient is the single loudest tell that a portrait
  // is not a photograph.
  _buildPlinth() {
    this.plinth = new THREE.Group()
    this.plinth.name = 'portraitPlinth'

    const slab = new THREE.Mesh(
      new GEO.CylinderGeometry(1, 1, 0.17, 56, 1),
      pbr(0x171b2e, 'concrete', { mapOpts: { scale: 1.4, repeat: [3, 3], wear: 0.35 } }),
    )
    slab.position.y = -0.088
    slab.receiveShadow = true
    slab.castShadow = false
    this.plinth.add(slab)

    const trim = new THREE.Mesh(
      new GEO.CylinderGeometry(1.045, 1.045, 0.035, 56, 1),
      pbr(0xd7a53c, 'gold'),
    )
    trim.position.y = -0.012
    trim.receiveShadow = true
    this.plinth.add(trim)

    const skirt = new THREE.Mesh(
      new GEO.CylinderGeometry(0.93, 0.86, 0.075, 48, 1),
      pbr(0x0d1020, 'metal-rough'),
    )
    skirt.position.y = -0.205
    this.plinth.add(skirt)

    this.scene.add(this.plinth)
  }

  _buildResolvePass() {
    this.resolveMat = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uExposure: { value: 1 },
        uContrast: { value: 1.1 },
        uSaturation: { value: 1.05 },
        uBloom: { value: 0.6 },
        uThreshold: { value: 1.05 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: GRADE_VERT,
      fragmentShader: GRADE_FRAG,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      transparent: true,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.resolveMat)
    // The vertex shader writes clip space directly; a quad sitting exactly on
    // the near plane is a classic frustum-cull disappearance.
    quad.frustumCulled = false
    this.resolveScene = new THREE.Scene()
    this.resolveScene.add(quad)
    this.resolveCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  _targetsFor(size) {
    let t = this.targets.get(size)
    if (t) return t
    const common = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 4,              // MSAA — a 512px portrait cannot hide a jaggy
    }
    t = {
      colour: new THREE.WebGLRenderTarget(size, size, { ...common, type: THREE.HalfFloatType }),
      resolve: new THREE.WebGLRenderTarget(size, size, {
        ...common, samples: 0, type: THREE.UnsignedByteType,
      }),
      buf: new Uint8Array(size * size * 4),
    }
    this.targets.set(size, t)
    return t
  }

  // ------------------------------------------------------------ the model --

  _model(id, costume) {
    const key = `${id}|${costume}`
    const hit = this.models.get(key)
    if (hit) { this.models.delete(key); this.models.set(key, hit); return hit }

    const def = Characters[id]
    if (!def || typeof def.buildModel !== 'function') return null
    let built = null
    try { built = def.buildModel(costume | 0) } catch (e) {
      console.warn(`[portrait] buildModel(${id}) threw`, e)
      return null
    }
    if (!built || !built.group) return null

    // The fighters that still hand-roll their materials get the same treatment
    // the arena pass gives them; the ones already built through pbr() tag
    // themselves `__wcsUpgraded` and are skipped.
    try { upgradeMaterials(built.group) } catch (e) { console.warn('[portrait] upgrade failed', e) }
    built.group.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return
      o.castShadow = true
      o.receiveShadow = true
      o.frustumCulled = false
    })

    let anim = null
    try { anim = new Animator(built.bones || {}, def.clips || {}) } catch (e) { anim = null }

    const rec = { group: built.group, anim, height: def.height || 1.8 }
    this.models.set(key, rec)
    while (this.models.size > 3) {
      const oldest = this.models.keys().next().value
      const dead = this.models.get(oldest)
      this.models.delete(oldest)
      this._disposeModel(dead)
    }
    return rec
  }

  // The evicted model's GPU buffers, minus anything the render layer owns.
  // `isSharedGeometry` / `isSharedMaterial` are the two guards in the README's
  // §5 hazard list: a bare dispose() walk here would tear the geometry cache
  // and the material cache out from under a live match.
  _disposeModel(rec) {
    if (!rec || !rec.group) return
    rec.group.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return
      const geo = o.geometry
      if (geo && !isSharedGeometry(geo) && !geo.userData?.__shared) {
        try { geo.dispose() } catch (e) { /* already gone */ }
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m || isSharedMaterial(m)) continue
        try { disposeMaterialSafely(m) } catch (e) { /* shared texture guard */ }
      }
    })
  }

  _pose(rec, poseName) {
    const plan = POSE[poseName] || POSE.idle
    const anim = rec.anim
    if (!anim) return
    const clip = plan.clip.find((c) => anim.has(c))
    if (!clip) return
    try {
      anim.play(clip, { restart: true, speed: 1 })
      const step = 1 / 60
      for (let t = 0; t < plan.t; t += step) anim.update(step)
    } catch (e) { /* a clip that will not sample is not worth a black portrait */ }
  }

  // ---------------------------------------------------------------- frame --

  _frame(rec, fr) {
    this.subject.position.set(0, 0, 0)
    this.subject.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(this.subject)
    if (!isFinite(box.min.x) || box.isEmpty()) return null

    const cx = (box.min.x + box.max.x) * 0.5
    const cz = (box.min.z + box.max.z) * 0.5
    this.subject.position.set(-cx, 0, -cz)
    this.subject.updateMatrixWorld(true)

    const H = Math.max(box.max.y, rec.height * 0.55, 0.6)
    const bodyH = Math.max(box.max.y - Math.min(box.min.y, 0), 0.4)
    const projW = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) * 0.72

    let visible, eyeY
    if (fr.plinth) {
      visible = bodyH * fr.visible
      eyeY = Math.min(box.min.y, 0) + bodyH * 0.5
    } else {
      visible = Math.max(fr.visible * H, 0.3)
      eyeY = box.max.y - visible * 0.44
    }
    visible = Math.max(visible, projW * 1.02)

    const fov = fr.fov * Math.PI / 180
    const dist = (visible * 0.5) / Math.tan(fov * 0.5) + 0.35

    this.camera.fov = fr.fov
    this.camera.aspect = 1
    this.camera.near = Math.max(0.05, dist * 0.2)
    this.camera.far = dist * 4 + 20
    const ch = Math.cos(fr.pitch)
    this.camera.position.set(
      Math.cos(fr.yaw) * dist * ch,
      eyeY + Math.sin(fr.pitch) * dist,
      Math.sin(fr.yaw) * dist * ch,
    )
    this.camera.lookAt(0, eyeY, 0)
    this.camera.updateProjectionMatrix()

    // Plinth only exists in the framings that can see it; a hidden plinth still
    // costs a shadow-map draw, so it leaves the scene entirely.
    this.plinth.visible = !!fr.plinth
    if (fr.plinth) {
      const r = Math.max(0.42, projW * 0.62)
      this.plinth.scale.set(r, 1, r)
    }

    this.rig.setFocus({ x: 0, y: eyeY * 0.9, z: 0 }, Math.max(1.1, visible * 0.72))
    this.rig.update(0.6, undefined, this.camera)
    return { eyeY, visible }
  }

  // ----------------------------------------------------------------- bake --

  // Renders one portrait and returns an ImageData-backed canvas, or null.
  bake(id, costume, framingName, poseName, lookName) {
    const fr = FRAMING[framingName] || FRAMING.hero
    const look = LOOK[lookName] || LOOK.neutral
    const rec = this._model(id, costume)
    if (!rec) return null

    this.subject.clear()
    this.subject.add(rec.group)
    rec.group.position.set(0, 0, 0)
    rec.group.rotation.set(0, 0, 0)
    rec.group.scale.setScalar(1)
    this._pose(rec, poseName)
    const framed = this._frame(rec, fr)
    if (!framed) { this.subject.clear(); return null }

    // hero light, retinted per card
    const L = this.lights
    if (L.key) { L.key.color.setHex(look.key); L.key.intensity = look.keyI }
    if (L.fill) { L.fill.color.setHex(look.fill); L.fill.intensity = look.fillI }
    if (L.rim) { L.rim.color.setHex(look.rim); L.rim.intensity = look.rimI }
    try { this.rig.rebase() } catch (e) { /* older rig handle */ }
    if (this.env && typeof this.env.setIntensity === 'function') this.env.setIntensity(look.envI)

    const size = fr.size
    const t = this._targetsFor(size)
    const g = look.grade
    const u = this.resolveMat.uniforms
    u.tSrc.value = t.colour.texture
    u.uTexel.value.set(1 / size, 1 / size)
    u.uExposure.value = g.exposure
    u.uContrast.value = g.contrast
    u.uSaturation.value = g.saturation
    u.uBloom.value = g.bloom
    u.uTint.value.set(g.tint[0], g.tint[1], g.tint[2])

    const r = this.renderer
    const prevRT = r.getRenderTarget()
    const prevClear = r.getClearColor(new THREE.Color())
    const prevAlpha = r.getClearAlpha()
    const prevAuto = r.autoClear
    try {
      r.autoClear = true
      r.setClearColor(0x000000, 0)
      r.setRenderTarget(t.colour)
      r.clear(true, true, true)
      r.render(this.scene, this.camera)

      r.setRenderTarget(t.resolve)
      r.clear(true, false, false)
      r.render(this.resolveScene, this.resolveCam)
      r.readRenderTargetPixels(t.resolve, 0, 0, size, size, t.buf)
    } catch (e) {
      console.warn('[portrait] bake failed', e)
      this.subject.clear()
      r.setRenderTarget(prevRT)
      r.setClearColor(prevClear, prevAlpha)
      r.autoClear = prevAuto
      return null
    }
    r.setRenderTarget(prevRT)
    r.setClearColor(prevClear, prevAlpha)
    r.autoClear = prevAuto
    this.subject.clear()

    return composite(t.buf, size, look)
  }
}

// ---------------------------------------------------------------------------
// 2D composite — the designed backdrop the 3D render lands on.
// A portrait needs something BEHIND the subject that recedes: a lit pocket of
// depth, a floor bloom under the plinth, a vignette that closes the frame, and
// enough grain that none of the gradients band (contract §4 forbids the flat
// 2-stop ramp the old menu sky used).
// ---------------------------------------------------------------------------

let _grainTile = null

function grainTile() {
  if (_grainTile) return _grainTile
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (!g) return null
  const img = g.createImageData(64, 64)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.floor(Math.random() * 22)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  _grainTile = c
  return c
}

function drawBackdrop(g, S, bg) {
  g.fillStyle = bg.outer
  g.fillRect(0, 0, S, S)

  // the lit pocket — four stops so the ramp never bands
  const rg = g.createRadialGradient(S * 0.5, S * 0.40, S * 0.03, S * 0.5, S * 0.50, S * 0.82)
  rg.addColorStop(0, bg.inner)
  rg.addColorStop(0.34, shade(bg.inner, 0.62))
  rg.addColorStop(0.68, shade(bg.inner, 0.26))
  rg.addColorStop(1, bg.outer)
  g.fillStyle = rg
  g.fillRect(0, 0, S, S)

  // ray burst, uneven so it reads as light and not as a pie chart
  g.save()
  g.translate(S * 0.5, S * 0.42)
  g.strokeStyle = bg.ray
  g.lineCap = 'butt'
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + 0.13
    g.lineWidth = S * (i % 3 === 0 ? 0.024 : 0.011)
    g.globalAlpha = i % 2 ? 0.75 : 1
    g.beginPath()
    g.moveTo(Math.cos(a) * S * 0.10, Math.sin(a) * S * 0.10)
    g.lineTo(Math.cos(a) * S * 0.95, Math.sin(a) * S * 0.95)
    g.stroke()
  }
  g.restore()

  // floor bloom under the plinth
  const fg = g.createRadialGradient(S * 0.5, S * 0.86, 0, S * 0.5, S * 0.86, S * 0.46)
  fg.addColorStop(0, bg.floor)
  fg.addColorStop(1, 'rgba(0,0,0,0)')
  g.save()
  g.globalCompositeOperation = 'lighter'
  g.translate(0, S * 0.02)
  g.scale(1, 0.42)
  g.fillStyle = fg
  g.fillRect(0, S * 0.9, S, S * 1.2)
  g.restore()
}

function drawFinish(g, S) {
  // vignette
  const vg = g.createRadialGradient(S * 0.5, S * 0.47, S * 0.26, S * 0.5, S * 0.52, S * 0.78)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(0.72, 'rgba(0,0,0,0.22)')
  vg.addColorStop(1, 'rgba(0,0,0,0.62)')
  g.fillStyle = vg
  g.fillRect(0, 0, S, S)

  // grain — kills the last of the gradient banding and glues the 3D render to
  // the 2D plate so the composite does not read as a sticker
  const tile = grainTile()
  if (tile) {
    const pat = g.createPattern(tile, 'repeat')
    if (pat) {
      g.save()
      g.globalCompositeOperation = 'overlay'
      g.globalAlpha = 0.11
      g.fillStyle = pat
      g.fillRect(0, 0, S, S)
      g.restore()
    }
  }
}

// scale a #rrggbb toward black
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * k)
  const gg = Math.round(((n >> 8) & 255) * k)
  const b = Math.round((n & 255) * k)
  return `rgb(${r},${gg},${b})`
}

function composite(buf, S, look) {
  const scratch = document.createElement('canvas')
  scratch.width = scratch.height = S
  const sg = scratch.getContext('2d')
  if (!sg) return null
  const img = sg.createImageData(S, S)
  // GL origin is bottom-left, canvas origin is top-left
  const row = S * 4
  for (let y = 0; y < S; y++) {
    const src = (S - 1 - y) * row
    img.data.set(buf.subarray(src, src + row), y * row)
  }
  sg.putImageData(img, 0, 0)

  const out = document.createElement('canvas')
  out.width = out.height = S
  const g = out.getContext('2d')
  if (!g) return null
  drawBackdrop(g, S, look.bg)
  g.drawImage(scratch, 0, 0)
  drawFinish(g, S)
  return out
}

// ---------------------------------------------------------------------------
// Public API
//
//   heroPortrait(game, canvas, id, { framing, pose, look, costume, px })
//
// Paints the old doodle immediately so the card is never empty, queues one bake
// per animation frame, and swaps the finished render in when it lands. Every
// (id, costume, framing, pose, look) tuple is baked exactly once per session.
// ---------------------------------------------------------------------------

let _studio = null
let _studioFailed = false
const _cache = new Map()
const _queue = []
let _pumping = false
let _token = 0

function studioFor(game) {
  if (_studio || _studioFailed) return _studio
  if (!game || !game.renderer || typeof document === 'undefined') return null
  try {
    _studio = new Studio(game)
  } catch (e) {
    console.warn('[portrait] studio unavailable — falling back to flat portraits', e)
    _studioFailed = true
    _studio = null
  }
  return _studio
}

function paint(canvas, master, px, id) {
  if (!canvas || !master) return false
  const S = Math.max(64, Math.min(Math.round(px || master.width), master.width))
  try {
    canvas.width = S
    canvas.height = S
    const g = canvas.getContext('2d')
    if (!g) return false
    g.clearRect(0, 0, S, S)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(master, 0, 0, S, S)
    // ui.css asks for `image-rendering: pixelated` on every portrait canvas —
    // correct for a 96px doodle, wrong for a downsampled 512px render. Inline
    // style only: no CSS file is touched and no box changes size.
    canvas.style.imageRendering = 'auto'
    // Remember WHO is on this canvas: a re-request for the same fighter (a
    // costume swap, a pose change on lock-in) must not flash the doodle back
    // over a render that is already correct.
    canvas.__wcsPaintedId = id || null
    return true
  } catch (e) {
    return false
  }
}

function pump() {
  _pumping = false
  const job = _queue.shift()
  if (!job) return
  // The cursor has already moved on — a portrait nobody is looking at is not
  // worth a model build. (Cache hits below are still free.)
  if (job.token >= 0 && job.canvas && job.canvas.__wcsPortrait !== job.token) { schedule(); return }
  const st = studioFor(job.game)
  if (st) {
    let master = _cache.get(job.key)
    if (!master) {
      master = st.bake(job.id, job.costume, job.framing, job.pose, job.look)
      if (master) {
        _cache.set(job.key, master)
        // A 512px master is 1 MB of canvas backing store. 32 of them is the
        // whole roster in two framings and still under the texture budget;
        // past that the oldest goes.
        while (_cache.size > 32) _cache.delete(_cache.keys().next().value)
      }
    }
    if (master && job.canvas && job.canvas.__wcsPortrait === job.token) {
      paint(job.canvas, master, job.px, job.id)
      try { job.onReady?.(master) } catch (e) { /* caller's problem */ }
    }
  }
  schedule()
}

function schedule() {
  if (_pumping || !_queue.length) return
  _pumping = true
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pump)
  else setTimeout(pump, 16)
}

/**
 * Paint a real 3D portrait of `id` into `canvas`.
 *
 * framing 'hero' (full body on a plinth) | 'bust' (head and chest)
 * pose    'idle' | 'ready' | 'win' | 'lose' | 'entrance'
 * look    'neutral' | 'p1' | 'p2' | 'gold' | 'defeat'
 * px      backing-store size to paint at (defaults to the master size)
 */
export function heroPortrait(game, canvas, id, opts = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return
  const {
    framing = 'hero', pose = 'idle', look = 'neutral',
    costume = 0, px = 0, locked = false, onReady = null, priority = false,
  } = opts

  const token = ++_token
  canvas.__wcsPortrait = token

  if (locked || !Characters[id]) {
    canvas.style.imageRendering = ''
    canvas.__wcsPaintedId = null
    drawPortrait(canvas, id, { locked: true })
    return
  }

  const key = `${id}|${costume | 0}|${framing}|${pose}|${look}`
  const hit = _cache.get(key)
  if (hit) {
    if (paint(canvas, hit, px, id)) { try { onReady?.(hit) } catch (e) { /* caller's problem */ } }
    return
  }

  // Never leave the card empty while the bake is queued. If the canvas already
  // holds a render of this same fighter (a costume swap, a pose change), that
  // stale render is a far better placeholder than the doodle.
  if (canvas.__wcsPaintedId !== id) {
    canvas.style.imageRendering = ''
    canvas.__wcsPaintedId = null
    drawPortrait(canvas, id)
  }

  const job = { game, canvas, id, costume: costume | 0, framing, pose, look, px, key, token, onReady }
  // The hero card the player is actually looking at jumps the thumbnail queue.
  if (priority) _queue.unshift(job)
  else _queue.push(job)
  schedule()
}

/**
 * Warm the cache for a list of fighters without touching any canvas — used by
 * the select grid and the gallery rail so the whole roster converts to 3D over
 * the first second on screen instead of hitching on the first hover.
 */
export function prewarmPortraits(game, ids, opts = {}) {
  const { framing = 'bust', pose = 'idle', look = 'neutral', costume = 0 } = opts
  for (const id of ids || []) {
    if (!Characters[id]) continue
    const key = `${id}|${costume | 0}|${framing}|${pose}|${look}`
    if (_cache.has(key)) continue
    if (_queue.some((j) => j.key === key)) continue
    _queue.push({ game, canvas: null, id, costume: costume | 0, framing, pose, look, px: 0, key, token: -1, onReady: null })
  }
  schedule()
}

/** The finished render for a tuple, or null if it has not been baked yet. */
export function portraitMaster(id, opts = {}) {
  const { framing = 'hero', pose = 'idle', look = 'neutral', costume = 0 } = opts
  return _cache.get(`${id}|${costume | 0}|${framing}|${pose}|${look}`) || null
}

/** Diagnostics for the verify pass. */
export function portraitStats() {
  return { baked: _cache.size, queued: _queue.length, failed: _studioFailed }
}
