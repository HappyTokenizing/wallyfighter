// ============================================================================
// WALLY: CRYPTO SMACKDOWN — shared arena toolkit (ArenaBase)
// ----------------------------------------------------------------------------
// Reusable helpers every arena imports. Everything is procedural (Canvas 2D +
// primitive geometry), flat-shaded, chunky and proudly 2002. Exports:
//
//   makeRng(seed)                     tiny deterministic RNG (mulberry32)
//   flatMat(color, opts)              flat-shaded Lambert material
//   canvasTexture(w, h, draw, opts)   canvas -> THREE.CanvasTexture (SRGB)
//   disposeObject(root)               recursive geometry/material/texture free
//   buildSkyDome(colors, opts)        gradient sky sphere + painted clouds/sun
//                                     (sunAzimuth/sunHeight align the painted
//                                     sun with the arena's actual key light)
//   makeLightRig(scene, quality, o)   hemi + shadow-casting sun + fill + fog
//   makeSign(text, opts)              text board; opts.style picks a look:
//                                     'bevel'|'neon'|'plywood'|'flag'|'broken'
//   makeCandlestickChart(w, h, opts)  { texture, canvas, tick() } green/red candles
//   makeCoinMesh(radius, thick, o)    gold coin, faces toward +/-Z
//   makeCrateMesh(size, opts)         stenciled wooden crate
//   buildCrowd(opts)                  instanced bouncing spectator blobs
//   setMatchColors(colors)            v2.1 §27 team-shirt seam (see buildCrowd)
//   autoTagCameraOccluders(root, b)   v2.1 §27 occluder tagging + crowd hardening
//   addBreakableProp(physics, mesh,o) defensive physics.addProp wrapper
//   class ArenaBase                   base class: updaters/listeners/props/dispose
//
// Everything respects the active quality preset where relevant (crowd count and
// shadow toggles are the caller's job via `quality`, shadow map size is handled
// in makeLightRig).
// ============================================================================
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Deterministic RNG so arenas look identical every load (mulberry32).
// ---------------------------------------------------------------------------
export function makeRng(seed = 1337) {
  let s = seed >>> 0
  return function rng() {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Materials & textures
// ---------------------------------------------------------------------------
export function flatMat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts })
}

// Create a canvas, hand it to `draw(ctx2d, w, h)`, return a CanvasTexture.
// opts: { nearest = true (chunky texels), repeat = [rx, ry] }
export function canvasTexture(w, h, draw, opts = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.round(w))
  canvas.height = Math.max(2, Math.round(h))
  const c = canvas.getContext('2d')
  draw(c, canvas.width, canvas.height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  if (opts.nearest !== false) {
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
  }
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(opts.repeat[0], opts.repeat[1])
  }
  return tex
}

const MAP_SLOTS = ['map', 'emissiveMap', 'alphaMap', 'bumpMap', 'normalMap', 'aoMap', 'lightMap', 'specularMap']

// Recursively free geometry, materials, their textures — and light shadow maps.
export function disposeObject(root) {
  if (!root) return
  root.traverse((obj) => {
    if (obj.isLight) { try { obj.dispose() } catch (e) { /* shrug */ } }
    if (obj.geometry) obj.geometry.dispose()
    // textures parked off-material (e.g. a broken sign's unlit frame)
    if (obj.userData && Array.isArray(obj.userData._extraTextures)) {
      for (const t of obj.userData._extraTextures) { try { t.dispose() } catch (e) { /* fine */ } }
      obj.userData._extraTextures.length = 0
    }
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const m of mats) {
      for (const slot of MAP_SLOTS) if (m[slot]) m[slot].dispose()
      m.dispose()
    }
    if (obj.isInstancedMesh && obj.dispose) obj.dispose()
  })
}

// Merge simple geometries (position + normal only) into one for instancing.
function mergeGeoms(geoms) {
  const flat = geoms.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    if (n !== g) g.dispose()
    return n
  })
  let total = 0
  for (const g of flat) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  let off = 0
  for (const g of flat) {
    pos.set(g.attributes.position.array, off * 3)
    nor.set(g.attributes.normal.array, off * 3)
    off += g.attributes.position.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return out
}

// ---------------------------------------------------------------------------
// Sky dome — vertical gradient painted on a canvas, wrapped inside a sphere,
// with fat painted clouds and an optional chunky cartoon sun.
// colors: array of CSS colors, top of sky first, horizon last.
// opts: { radius = 85, clouds = true, sun = true, cloudColor, rng,
//         sunAzimuth, sunHeight }
//   sunAzimuth: world-space azimuth in radians (atan2(z, x) of the key light
//   direction) where the painted sun should sit, so sky and shading agree.
//   sunHeight: elevation above the horizon in radians. Both optional — when
//   omitted the sun keeps its old fixed spot (other arenas unchanged).
// ---------------------------------------------------------------------------
export function buildSkyDome(colors = ['#3fa9f5', '#9fd8ff', '#fff3c2'], opts = {}) {
  const radius = opts.radius ?? 85
  const rng = opts.rng || makeRng(4242)
  const tex = canvasTexture(512, 256, (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, 0, h * 0.62)
    const n = colors.length
    colors.forEach((col, i) => grad.addColorStop(n === 1 ? 0 : i / (n - 1), col))
    c.fillStyle = grad
    c.fillRect(0, 0, w, h * 0.62)
    // below the horizon: hold the last color so the dome floor never bands
    c.fillStyle = colors[colors.length - 1]
    c.fillRect(0, h * 0.6, w, h * 0.4)
    if (opts.sun !== false) {
      // SphereGeometry maps texture-u so a surface point at world azimuth `az`
      // (= atan2(z, x)) carries u = (PI - az) / 2PI; v runs 0 at the zenith.
      let sx = w * 0.78, sy = h * 0.16
      if (typeof opts.sunAzimuth === 'number') {
        const u = (Math.PI - opts.sunAzimuth) / (Math.PI * 2)
        sx = (((u % 1) + 1) % 1) * w
      }
      if (typeof opts.sunHeight === 'number') {
        const el = Math.max(0.06, Math.min(Math.PI / 2, opts.sunHeight))
        sy = (0.5 - el / Math.PI) * h
      }
      const r = 20
      const drawSunAt = (cx) => {
        c.strokeStyle = '#fff6b8'
        c.lineWidth = 5
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          c.beginPath()
          c.moveTo(cx + Math.cos(a) * (r + 6), sy + Math.sin(a) * (r + 6))
          c.lineTo(cx + Math.cos(a) * (r + 16), sy + Math.sin(a) * (r + 16))
          c.stroke()
        }
        c.fillStyle = '#fff2a1'
        c.beginPath(); c.arc(cx, sy, r, 0, Math.PI * 2); c.fill()
        c.fillStyle = '#ffe14d'
        c.beginPath(); c.arc(cx, sy, r * 0.7, 0, Math.PI * 2); c.fill()
      }
      drawSunAt(sx)
      // the texture wraps horizontally — repaint across the seam when close
      if (sx < r + 20) drawSunAt(sx + w)
      if (sx > w - (r + 20)) drawSunAt(sx - w)
    }
    if (opts.clouds !== false) {
      const cloud = opts.cloudColor || 'rgba(255,255,255,0.92)'
      for (let i = 0; i < 9; i++) {
        const cx = rng() * w
        const cy = h * (0.12 + rng() * 0.3)
        const s = 14 + rng() * 26
        c.fillStyle = cloud
        for (let b = 0; b < 4; b++) {
          c.beginPath()
          c.ellipse(cx + (b - 1.5) * s * 0.55, cy + (b % 2) * s * 0.16, s * (0.55 + rng() * 0.3), s * 0.36, 0, 0, Math.PI * 2)
          c.fill()
        }
        // flat cloud bottom — very important, very 2002
        c.fillRect(cx - s * 1.15, cy + s * 0.18, s * 2.3, s * 0.2)
      }
    }
  }, { nearest: false })
  const geo = new THREE.SphereGeometry(radius, 24, 14)
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'skyDome'
  mesh.renderOrder = -10
  return mesh
}

// ---------------------------------------------------------------------------
// Light rig: bright arcade hemisphere + one shadow-casting sun + soft fill.
// Also installs simple scene fog. Returns { group, sun, hemi, fill, dispose }.
// dispose() restores whatever fog the scene had before.
// quality: { shadows, shadowSize } from GameConfig.quality.
// ---------------------------------------------------------------------------
export function makeLightRig(scene, quality = {}, opts = {}) {
  const group = new THREE.Group()
  group.name = 'lightRig'

  const hemi = new THREE.HemisphereLight(opts.hemiSky ?? 0xcfeeff, opts.hemiGround ?? 0x86b978, opts.hemiIntensity ?? 1.05)
  group.add(hemi)

  const sun = new THREE.DirectionalLight(opts.sunColor ?? 0xfff2d0, opts.sunIntensity ?? 1.7)
  const sp = opts.sunPos || [10, 16, 9]
  sun.position.set(sp[0], sp[1], sp[2])
  sun.target.position.set(0, 0, 0)
  if (quality.shadows) {
    sun.castShadow = true
    const size = quality.shadowSize || 1024
    sun.shadow.mapSize.set(size, size)
    const a = opts.shadowArea ?? 16
    sun.shadow.camera.left = -a
    sun.shadow.camera.right = a
    sun.shadow.camera.top = a
    sun.shadow.camera.bottom = -a * 0.6
    sun.shadow.camera.near = 2
    sun.shadow.camera.far = 48
    sun.shadow.bias = -0.002
  }
  group.add(sun)
  group.add(sun.target)

  const fill = new THREE.DirectionalLight(opts.fillColor ?? 0xbfd9ff, opts.fillIntensity ?? 0.35)
  const fp = opts.fillPos || [-8, 6, 12]
  fill.position.set(fp[0], fp[1], fp[2])
  group.add(fill)

  const prevFog = scene ? scene.fog : null
  if (scene && opts.fog !== false) {
    const f = opts.fog || {}
    scene.fog = new THREE.Fog(f.color ?? 0xbfe9c8, f.near ?? 30, f.far ?? 80)
  }

  return {
    group, sun, hemi, fill,
    dispose() { if (scene) scene.fog = prevFog },
  }
}

// ---------------------------------------------------------------------------
// makeSign(text, opts) — arcade signboard. Returns a Mesh whose +Z face
// carries the painted text. Auto-shrinks the font to fit.
// opts: { w, h, depth, bg, fg, stroke, border, sub, subColor, px, tilt,
//         sideColor, style }
// style variants (default 'bevel' — pixel-identical to the classic board):
//   'bevel'   navy/gold beveled frame, drop-shadowed text
//   'neon'    glowing tube border + gas-tube letters on a dark cabinet
//   'plywood' rough hand-painted planks — grain, knots, nails (lit, not lit-up)
//   'flag'    tapered cloth pennant, hoist at the -X edge (not a box);
//             mesh.userData.wave(t) ripples it — call from an arena updater
//   'broken'  half-dead neon, some letters out; mesh.userData.flicker(t)
//             sputters the cabinet — call from an arena updater
// ---------------------------------------------------------------------------
const SIGN_FONT = '"Arial Black", "Impact", Arial, sans-serif'

function fitFontSize(c, text, maxW, size, weight = 900) {
  do {
    c.font = `${weight} ${size}px ${SIGN_FONT}`
    if (c.measureText(text).width <= maxW) break
    size -= 2
  } while (size > 8)
  return size
}

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r)
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r)
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r)
  c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r)
  c.closePath()
}

// FNV-1a — deterministic per-text seed so a sign looks the same every load
function textHash(text) {
  let hsh = 2166136261
  for (let i = 0; i < text.length; i++) {
    hsh ^= text.charCodeAt(i)
    hsh = Math.imul(hsh, 16777619)
  }
  return hsh >>> 0
}

function signBoxMesh(text, face, sideColor, w, h, depth, opts) {
  const side = flatMat(sideColor)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), [side, side, side, side, face, side])
  mesh.name = `sign:${text}`
  if (opts.tilt) mesh.rotation.x = opts.tilt
  return mesh
}

// Shared by 'neon' and 'broken'. o: { bg, fg, border, sub, subColor,
// powered, deadMask } — deadMask marks letters whose tube has given up.
function drawNeonFace(c, W, H, text, o) {
  c.fillStyle = o.bg
  c.fillRect(0, 0, W, H)
  // faint cabinet scuffs so the dark panel isn't a void
  c.fillStyle = 'rgba(255,255,255,0.035)'
  for (let i = 1; i < 5; i++) c.fillRect(Math.round((W / 5) * i), 0, 2, H)
  // tube border
  const m = Math.max(5, H * 0.1)
  const rr = Math.max(5, H * 0.16)
  const lw = Math.max(3, H * 0.045)
  c.save()
  roundRectPath(c, m, m, W - m * 2, H - m * 2, rr)
  if (o.powered) {
    c.strokeStyle = o.border
    c.shadowColor = o.border
    c.shadowBlur = H * 0.14
    c.lineWidth = lw
    c.stroke(); c.stroke() // double pass = hotter halo
    c.shadowBlur = 0
    c.globalAlpha = 0.9
    c.strokeStyle = '#ffffff'
    c.lineWidth = Math.max(1.5, lw * 0.35)
    c.stroke()
  } else {
    c.strokeStyle = 'rgba(165,175,195,0.28)' // dead glass
    c.lineWidth = lw
    c.stroke()
  }
  c.restore()
  // letters one at a time so individual tubes can die
  const subH = o.sub ? H * 0.26 : 0
  c.textBaseline = 'middle'
  c.textAlign = 'left'
  const size = fitFontSize(c, text, W * 0.8, Math.floor((H - subH) * 0.5))
  c.font = `900 ${size}px ${SIGN_FONT}`
  let x = (W - c.measureText(text).width) / 2
  const ty = (H - subH) * 0.54
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const cw = c.measureText(ch).width
    if (ch !== ' ') {
      const lit = o.powered && !(o.deadMask && o.deadMask[i])
      c.save()
      if (lit) {
        c.shadowColor = o.fg
        c.shadowBlur = size * 0.3
        c.fillStyle = o.fg
        c.fillText(ch, x, ty)
        c.fillText(ch, x, ty)
        c.shadowBlur = 0
        c.globalAlpha = 0.85
        c.fillStyle = '#ffffff'
        c.fillText(ch, x, ty)
      } else {
        c.fillStyle = o.powered ? 'rgba(150,155,175,0.30)' : 'rgba(150,155,175,0.20)'
        c.fillText(ch, x, ty)
      }
      c.restore()
    }
    x += cw
  }
  if (o.sub) {
    let ss = Math.floor(subH * 0.6)
    do {
      c.font = `700 ${ss}px ${SIGN_FONT}`
      if (c.measureText(o.sub).width <= W * 0.8) break
      ss -= 2
    } while (ss > 6)
    c.textAlign = 'center'
    c.fillStyle = o.powered ? (o.subColor ?? o.fg) : 'rgba(150,155,175,0.22)'
    c.fillText(o.sub, W / 2, H - subH * 0.55)
  }
}

function makeNeonSign(text, opts, broken) {
  const w = opts.w ?? 4
  const h = opts.h ?? 1.2
  const depth = opts.depth ?? 0.18
  const px = opts.px ?? 96
  const bg = opts.bg ?? '#0b0b16'
  const fg = opts.fg ?? '#ff5ef0'
  const border = opts.border ?? fg
  const hsh = textHash(text)
  let deadMask = null
  if (broken) {
    // deterministic casualties: ~30% of tubes are out, never all, never none
    const r = makeRng(hsh || 1)
    deadMask = Array.from(text, (ch) => ch !== ' ' && r() < 0.3)
    const idx = []
    for (let i = 0; i < text.length; i++) if (text[i] !== ' ') idx.push(i)
    if (idx.length) {
      if (!deadMask.some(Boolean)) deadMask[idx[hsh % idx.length]] = true
      if (idx.every((i) => deadMask[i])) deadMask[idx[(hsh >>> 3) % idx.length]] = false
    }
  }
  const common = { bg, fg, border, sub: opts.sub, subColor: opts.subColor, deadMask }
  const texOn = canvasTexture(w * px, h * px, (c, W, H) => drawNeonFace(c, W, H, text, { ...common, powered: true }), { nearest: false })
  const face = new THREE.MeshBasicMaterial({ map: texOn })
  const mesh = signBoxMesh(text, face, opts.sideColor ?? 0x08080f, w, h, depth, opts)
  if (broken) {
    const texOff = canvasTexture(w * px, h * px, (c, W, H) => drawNeonFace(c, W, H, text, { ...common, powered: false }), { nearest: false })
    mesh.userData._extraTextures = [texOn, texOff] // disposeObject frees both
    let lit = true
    mesh.userData.setLit = (on) => {
      on = !!on
      if (on === lit) return
      lit = on
      face.map = on ? texOn : texOff
    }
    const ph = ((hsh % 1000) / 1000) * Math.PI * 2
    mesh.userData.flicker = (t) => {
      // beating sines = sputter; the slow sine adds a rare longer brown-out
      const n = Math.sin(t * 9.7 + ph) * Math.sin(t * 5.3 + ph * 2.1) + Math.sin(t * 23.7 + ph) * 0.4
      const brownOut = Math.sin(t * 0.37 + ph) > 0.965
      mesh.userData.setLit(!brownOut && n > -0.8)
    }
  }
  return mesh
}

function makePlywoodSign(text, opts) {
  const w = opts.w ?? 4
  const h = opts.h ?? 1.2
  const depth = opts.depth ?? 0.18
  const px = opts.px ?? 96
  const bg = opts.bg ?? '#95805f'
  const fg = opts.fg ?? '#f3ecd7'
  const rng = makeRng(textHash(text) || 7)
  const tex = canvasTexture(w * px, h * px, (c, W, H) => {
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    // planks, each a slightly different tone, seams a little crooked
    const planks = Math.max(2, Math.round(h / 0.3))
    const ph = H / planks
    for (let i = 0; i < planks; i++) {
      c.fillStyle = `rgba(${(60 + rng() * 30) | 0},${(45 + rng() * 22) | 0},${(25 + rng() * 15) | 0},${(0.07 + rng() * 0.1).toFixed(3)})`
      c.fillRect(0, i * ph, W, ph)
      if (i > 0) {
        c.strokeStyle = 'rgba(52,40,24,0.55)'
        c.lineWidth = 2
        c.beginPath(); c.moveTo(0, i * ph); c.lineTo(W, i * ph + (rng() - 0.5) * 4); c.stroke()
      }
    }
    // grain streaks
    c.strokeStyle = 'rgba(58,44,26,0.2)'
    c.lineWidth = 1.5
    const nGrain = Math.max(6, Math.round(W / 20))
    for (let i = 0; i < nGrain; i++) {
      const gx = rng() * W
      const gy = rng() * H
      const len = 12 + rng() * W * 0.22
      c.beginPath()
      c.moveTo(gx, gy)
      c.quadraticCurveTo(gx + len * 0.5, gy + (rng() - 0.5) * 7, gx + len, gy + (rng() - 0.5) * 4)
      c.stroke()
    }
    // a knot or two
    for (let i = 0; i < 2; i++) {
      const kx = W * (0.12 + rng() * 0.76)
      const ky = H * (0.12 + rng() * 0.76)
      c.strokeStyle = 'rgba(50,36,20,0.5)'
      c.lineWidth = 2
      c.beginPath(); c.ellipse(kx, ky, 5 + rng() * 4, 3 + rng() * 3, rng(), 0, Math.PI * 2); c.stroke()
      c.fillStyle = 'rgba(50,36,20,0.55)'
      c.beginPath(); c.ellipse(kx, ky, 2.5, 1.8, 0, 0, Math.PI * 2); c.fill()
    }
    // hand-painted text: a hair crooked, paint bleed underneath, worn spots
    const subH = opts.sub ? H * 0.26 : 0
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const size = fitFontSize(c, text, W * 0.84, Math.floor((H - subH) * 0.54))
    c.save()
    c.translate(W / 2, (H - subH) * 0.54)
    c.rotate((rng() - 0.5) * 0.04)
    c.font = `900 ${size}px ${SIGN_FONT}`
    c.fillStyle = 'rgba(40,30,16,0.45)'
    c.fillText(text, size * 0.04, size * 0.06)
    c.fillStyle = fg
    c.fillText(text, 0, 0)
    c.restore()
    if (opts.sub) {
      let ss = Math.floor(subH * 0.58)
      do {
        c.font = `700 ${ss}px ${SIGN_FONT}`
        if (c.measureText(opts.sub).width <= W * 0.8) break
        ss -= 2
      } while (ss > 6)
      c.fillStyle = opts.subColor ?? 'rgba(46,34,18,0.85)'
      c.fillText(opts.sub, W / 2, H - subH * 0.5)
    }
    // chipped paint: speckle wood color back over the lettering band
    c.fillStyle = bg
    c.globalAlpha = 0.75
    for (let i = 0; i < 12; i++) {
      c.fillRect(W * (0.1 + rng() * 0.8), H * (0.25 + rng() * 0.5), 2 + rng() * 4, 1.5 + rng() * 3)
    }
    c.globalAlpha = 1
    // corner nails
    const nm = Math.max(6, H * 0.09)
    for (const [nx, ny] of [[nm, nm], [W - nm, nm], [nm, H - nm], [W - nm, H - nm]]) {
      c.fillStyle = 'rgba(35,32,28,0.9)'
      c.beginPath(); c.arc(nx, ny, Math.max(2.5, H * 0.022), 0, Math.PI * 2); c.fill()
      c.fillStyle = 'rgba(220,220,210,0.5)'
      c.beginPath(); c.arc(nx - 1, ny - 1, Math.max(1, H * 0.009), 0, Math.PI * 2); c.fill()
    }
  }, { nearest: false })
  // painted wood is lit by the scene, not self-lit like the arcade boards
  const face = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  return signBoxMesh(text, face, opts.sideColor ?? 0x6b5844, w, h, depth, opts)
}

function makeFlagSign(text, opts) {
  const w = opts.w ?? 4
  const h = opts.h ?? 1.2
  const px = opts.px ?? 96
  const bg = opts.bg ?? '#0b3d22'
  const fg = opts.fg ?? '#37e05f'
  const trim = opts.border ?? fg
  const tex = canvasTexture(w * px, h * px, (c, W, H) => {
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    // cloth weave
    c.strokeStyle = 'rgba(255,255,255,0.05)'
    c.lineWidth = 1
    for (let y = 0; y < H; y += 7) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + 2); c.stroke() }
    c.strokeStyle = 'rgba(0,0,0,0.06)'
    for (let x = 0; x < W; x += 9) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 2, H); c.stroke() }
    // trim stripes (the taper squeezes them toward the point — free chevron)
    c.save()
    c.globalAlpha = 0.55
    c.fillStyle = trim
    c.fillRect(0, 0, W, Math.max(3, H * 0.06))
    c.fillRect(0, H - Math.max(3, H * 0.06), W, Math.max(3, H * 0.06))
    c.restore()
    // hoist band + grommets
    c.fillStyle = 'rgba(0,0,0,0.28)'
    c.fillRect(0, 0, Math.max(4, W * 0.045), H)
    c.fillStyle = '#d9c46a'
    for (const gy of [H * 0.16, H * 0.84]) {
      c.beginPath(); c.arc(Math.max(2, W * 0.024), gy, Math.max(2.5, H * 0.03), 0, Math.PI * 2); c.fill()
    }
    // text lives in the left ~60% so the taper barely distorts it
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const size = fitFontSize(c, text, W * 0.58, Math.floor(H * 0.42))
    c.fillStyle = 'rgba(0,0,0,0.35)'
    c.fillText(text, W * 0.35 + size * 0.05, H * 0.5 + size * 0.06)
    c.fillStyle = fg
    c.fillText(text, W * 0.35, H * 0.5)
  }, { nearest: false })
  const segX = 16
  const geo = new THREE.PlaneGeometry(w, h, segX, 4)
  const pos = geo.attributes.position
  const txArr = new Float32Array(pos.count) // 0 at hoist, 1 at the point
  for (let i = 0; i < pos.count; i++) {
    const tx = pos.getX(i) / w + 0.5
    txArr[i] = tx
    pos.setY(i, pos.getY(i) * (1 - 0.82 * tx * tx)) // wedge taper
    pos.setZ(i, Math.sin(tx * 5.2) * w * 0.022 * tx) // baked resting ripple
  }
  // flatShading derives normals in-shader, so waving never recomputes them
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = `sign:${text}`
  if (opts.tilt) mesh.rotation.x = opts.tilt
  mesh.userData.wave = (t) => {
    for (let i = 0; i < pos.count; i++) {
      const tx = txArr[i]
      pos.setZ(i, (Math.sin(tx * 5.2 - t * 2.6) * 0.022 + Math.sin(tx * 9.1 - t * 4.3) * 0.008) * w * tx)
    }
    pos.needsUpdate = true
  }
  return mesh
}

export function makeSign(text, opts = {}) {
  const style = opts.style ?? 'bevel'
  if (style === 'neon' || style === 'broken') return makeNeonSign(text, opts, style === 'broken')
  if (style === 'plywood') return makePlywoodSign(text, opts)
  if (style === 'flag') return makeFlagSign(text, opts)
  // -- 'bevel': the classic board, untouched -------------------------------
  const w = opts.w ?? 4
  const h = opts.h ?? 1.2
  const depth = opts.depth ?? 0.18
  const px = opts.px ?? 96
  const bg = opts.bg ?? '#132a63'
  const fg = opts.fg ?? '#ffd83d'
  const stroke = opts.stroke ?? '#0a1233'
  const border = opts.border ?? '#ffd83d'
  const tex = canvasTexture(w * px, h * px, (c, W, H) => {
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    // beveled frame
    c.lineWidth = Math.max(4, H * 0.06)
    c.strokeStyle = border
    c.strokeRect(c.lineWidth * 0.9, c.lineWidth * 0.9, W - c.lineWidth * 1.8, H - c.lineWidth * 1.8)
    // fit text
    const subH = opts.sub ? H * 0.26 : 0
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const size = fitFontSize(c, text, W * 0.86, Math.floor((H - subH) * 0.58))
    const ty = (H - subH) * 0.52
    c.fillStyle = stroke
    c.fillText(text, W / 2 + size * 0.05, ty + size * 0.07)
    c.lineWidth = Math.max(2, size * 0.08)
    c.strokeStyle = stroke
    c.strokeText(text, W / 2, ty)
    c.fillStyle = fg
    c.fillText(text, W / 2, ty)
    if (opts.sub) {
      let ss = Math.floor(subH * 0.62)
      do {
        c.font = `700 ${ss}px ${SIGN_FONT}`
        if (c.measureText(opts.sub).width <= W * 0.8) break
        ss -= 2
      } while (ss > 6)
      c.fillStyle = opts.subColor ?? '#9fe8b0'
      c.fillText(opts.sub, W / 2, H - subH * 0.55)
    }
  }, { nearest: false })
  const face = new THREE.MeshBasicMaterial({ map: tex })
  return signBoxMesh(text, face, opts.sideColor ?? 0x0a1233, w, h, depth, opts)
}

// ---------------------------------------------------------------------------
// makeCandlestickChart(w, h) — canvas texture of green/red candles with a
// header ticker. Returns { texture, canvas, tick() } — tick() rolls a new
// candle in (number goes up, mostly) and refreshes the texture.
// ---------------------------------------------------------------------------
export function makeCandlestickChart(w = 512, h = 256, opts = {}) {
  const rng = opts.rng || makeRng(69420)
  const nCandles = opts.candles ?? 22
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const c = canvas.getContext('2d')
  const up = opts.up ?? '#37e05f'
  const down = opts.down ?? '#ff4d5e'
  const bg = opts.bg ?? '#0b1530'
  let header = opts.header ?? '$WALLY / USD'
  let pct = 420.69
  const data = []
  let price = 30
  const roll = () => {
    const o = price
    const delta = (rng() - 0.40) * 14 // upward bias: this market only knows hope
    price = Math.max(6, Math.min(96, price + delta))
    const cl = price
    const hi = Math.max(o, cl) + rng() * 5
    const lo = Math.min(o, cl) - rng() * 5
    data.push({ o, c: cl, h: hi, l: lo })
    if (data.length > nCandles) data.shift()
  }
  for (let i = 0; i < nCandles; i++) roll()

  const headH = Math.round(h * 0.16)
  const draw = () => {
    c.fillStyle = bg
    c.fillRect(0, 0, w, h)
    // grid
    c.strokeStyle = 'rgba(120,150,220,0.16)'
    c.lineWidth = 2
    for (let y = headH + 12; y < h; y += Math.round((h - headH) / 5)) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke()
    }
    // candles
    const pad = 8
    const cw = (w - pad * 2) / nCandles
    const py = (v) => headH + (h - headH - 8) * (1 - v / 100)
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const x = pad + i * cw + cw / 2
      const col = d.c >= d.o ? up : down
      c.strokeStyle = col
      c.lineWidth = Math.max(2, cw * 0.12)
      c.beginPath(); c.moveTo(x, py(d.h)); c.lineTo(x, py(d.l)); c.stroke()
      c.fillStyle = col
      const top = py(Math.max(d.o, d.c))
      const bot = py(Math.min(d.o, d.c))
      c.fillRect(x - cw * 0.34, top, cw * 0.68, Math.max(3, bot - top))
    }
    // big dumb arrow tracking the last candle
    const last = data[data.length - 1]
    const ax = w - pad - cw * 0.5
    const ay = py(last.c) - 14
    c.fillStyle = last.c >= last.o ? up : down
    c.beginPath()
    c.moveTo(ax, ay - 16); c.lineTo(ax - 12, ay); c.lineTo(ax + 12, ay)
    c.closePath(); c.fill()
    // header
    c.fillStyle = 'rgba(6,10,26,0.92)'
    c.fillRect(0, 0, w, headH)
    c.textBaseline = 'middle'
    c.textAlign = 'left'
    c.font = `900 ${Math.round(headH * 0.62)}px "Arial Black", Arial, sans-serif`
    c.fillStyle = '#e8efff'
    c.fillText(header, 10, headH * 0.55)
    c.textAlign = 'right'
    c.fillStyle = up
    c.fillText(`+${pct.toFixed(2)}%`, w - 10, headH * 0.55)
  }
  draw()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return {
    texture,
    canvas,
    tick() {
      roll()
      pct = Math.max(1, pct + (rng() - 0.35) * 9)
      draw()
      texture.needsUpdate = true
    },
    // retitle the board (e.g. to the actual matchup at match start)
    setHeader(text) {
      header = String(text)
      draw()
      texture.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------------------
// makeCoinMesh — a fat gold coin, faces pointing +/-Z (standing orientation).
// opts: { text = '$W', color, rimColor, px }
// ---------------------------------------------------------------------------
export function makeCoinMesh(radius = 0.8, thickness = 0.2, opts = {}) {
  const text = opts.text ?? '$W'
  const px = opts.px ?? 128
  const face = canvasTexture(px, px, (c, W, H) => {
    c.fillStyle = opts.faceBg ?? '#f5c33b'
    c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#c8921d'
    c.lineWidth = W * 0.06
    c.beginPath(); c.arc(W / 2, H / 2, W * 0.40, 0, Math.PI * 2); c.stroke()
    // rim notches
    c.lineWidth = W * 0.035
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      c.beginPath()
      c.moveTo(W / 2 + Math.cos(a) * W * 0.44, H / 2 + Math.sin(a) * W * 0.44)
      c.lineTo(W / 2 + Math.cos(a) * W * 0.49, H / 2 + Math.sin(a) * W * 0.49)
      c.stroke()
    }
    c.font = `900 ${W * 0.42}px "Arial Black", Arial, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#c8921d'
    c.fillText(text, W / 2 + W * 0.02, H / 2 + W * 0.05)
    c.fillStyle = '#8a5e0d'
    c.fillText(text, W / 2, H / 2 + W * 0.02)
  })
  const geo = new THREE.CylinderGeometry(radius, radius, thickness, 14)
  geo.rotateX(Math.PI / 2) // caps face +/-Z
  const rim = flatMat(opts.rimColor ?? 0xd9a325)
  const cap = new THREE.MeshLambertMaterial({ map: face, flatShading: true })
  const mesh = new THREE.Mesh(geo, [rim, cap, cap])
  mesh.name = 'coin'
  return mesh
}

// ---------------------------------------------------------------------------
// makeCrateMesh — stenciled wooden crate, one texture on all faces.
// opts: { color = '#c98f4a', label = 'HODL', px }
// ---------------------------------------------------------------------------
export function makeCrateMesh(size = 0.7, opts = {}) {
  const base = opts.color ?? '#c98f4a'
  const px = opts.px ?? 96
  const tex = canvasTexture(px, px, (c, W, H) => {
    c.fillStyle = base
    c.fillRect(0, 0, W, H)
    // planks
    c.strokeStyle = 'rgba(60,30,5,0.45)'
    c.lineWidth = 3
    for (let i = 1; i < 4; i++) {
      c.beginPath(); c.moveTo(0, (H / 4) * i); c.lineTo(W, (H / 4) * i); c.stroke()
    }
    // frame + diagonal brace
    c.strokeStyle = 'rgba(80,42,8,0.85)'
    c.lineWidth = Math.max(6, W * 0.09)
    c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, W - c.lineWidth, H - c.lineWidth)
    c.beginPath(); c.moveTo(4, H - 4); c.lineTo(W - 4, 4); c.stroke()
    if (opts.label) {
      c.font = `900 ${W * 0.3}px "Arial Black", Arial, sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = 'rgba(40,20,4,0.8)'
      c.fillText(opts.label, W / 2, H / 2)
    }
  })
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  )
  mesh.name = 'crate'
  return mesh
}

// ---------------------------------------------------------------------------
// buildCrowd — instanced low-poly spectator blobs with a 2-keyframe cartoon
// bounce (squash on the floor, stretch at the apex), per-instance color and
// phase, tiered rows, and knockOver() ragdoll-lite for Unhinged mode.
//
// opts: {
//   count, area: { w, d },   // local X width, depth (rows step back in -Z)
//   palette: [css...],       // per-instance tint pool
//   rng, risers = true,      // dark bleacher steps under the rows
//   bounce = 0.22,           // hop height in meters
//   teamColors: [hexA, hexB] // v2.1 §27 team shirts: ~12% of instances wear
//                            // each fighter's color, rest keep the palette.
//                            // Defaults from ctx.fighterColors (the ArenaBase
//                            // constructor stashes it — see setMatchColors),
//                            // so existing arenas get shirts with NO changes.
// }
// The crowd faces its local +Z. Position/rotate the returned `group` so +Z
// points at the arena. Returns:
//   { group, mesh, count, update(dt), cheer(strength), knockOver(i, dir?),
//     knockOverRandom(n, dir?), dispose() }
// knockOver dir (optional — omit for the classic backward tumble):
//   undefined     fall backward into the stands (local -Z)
//   +1 | -1       swept sideways along the row (local +/-X), e.g. by an
//                 impact travelling along the bleacher
//   { x, z }      fall toward that crowd-local horizontal direction; the
//                 forward (+Z) component is clamped so victims always land in
//                 the stands, never through the barrier onto the fight floor
// ---------------------------------------------------------------------------
export const CROWD_PALETTE = ['#3f5dc9', '#38b26b', '#e8b13c', '#d95d3f', '#7a4fd0', '#3fbcd4', '#e05e9e', '#8a939e']

// ---------------------------------------------------------------------------
// v2.1 §27 team-shirt seam. Arenas call buildCrowd(opts) without knowing the
// matchup, so the fighters' primary colors flow in OUT OF BAND: MatchScreen
// passes ctx.fighterColors = [hexP1, hexP2] into arena build, the ArenaBase
// constructor stashes it here (module level), and buildCrowd reads it as the
// default for opts.teamColors. MatchScreen may also call
// ArenaBase.setMatchColors(colors) directly before building the arena — both
// seams work; explicit opts.teamColors always wins. ArenaBase.dispose() clears
// the stash it owns so colors never leak into a later, colorless build.
// ---------------------------------------------------------------------------
let _matchTeamColors = null

function normTeamColors(v) {
  if (!Array.isArray(v)) return null
  const out = []
  for (const c of v) {
    if (typeof c === 'string' || (typeof c === 'number' && Number.isFinite(c))) out.push(c)
    if (out.length === 2) break
  }
  return out.length ? out : null
}

export function setMatchColors(colors) {
  _matchTeamColors = normTeamColors(colors)
}

function blobGeometry() {
  const body = new THREE.SphereGeometry(0.34, 7, 5)
  body.scale(1, 1.25, 0.9)
  body.translate(0, 0.44, 0)
  const head = new THREE.SphereGeometry(0.2, 6, 5)
  head.translate(0, 1.0, 0)
  const fistL = new THREE.SphereGeometry(0.09, 5, 4)
  fistL.translate(-0.36, 0.9, 0.1)
  const fistR = new THREE.SphereGeometry(0.09, 5, 4)
  fistR.translate(0.36, 0.9, 0.1)
  return mergeGeoms([body, head, fistL, fistR])
}

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }
const easeInOut = (t) => t * t * (3 - 2 * t)

export function buildCrowd(opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? 24))
  const areaW = opts.area?.w ?? 10
  const areaD = opts.area?.d ?? 2.4
  const rng = opts.rng || makeRng(0xbeef)
  const palette = opts.palette || CROWD_PALETTE
  const bounceH = opts.bounce ?? 0.22
  const teamColors = normTeamColors(opts.teamColors) ||
    normTeamColors(opts.ctx?.fighterColors) || _matchTeamColors

  const group = new THREE.Group()
  group.name = 'crowd'
  group.userData.isCrowd = true
  const geo = blobGeometry()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  // v2.1 §27 CROWD MUST NEVER VANISH: an InstancedMesh is frustum-culled by
  // its GEOMETRY's bounding sphere — a ~1 m blob at the group origin — while
  // the instances sit meters away along the stands. At plenty of camera
  // angles that stale sphere left the frustum and the ENTIRE crowd popped
  // out of existence. Culling a ring of spectators that surrounds the arena
  // buys nothing, so switch it off outright.
  mesh.frustumCulled = false
  mesh.userData.isCrowd = true
  mesh.castShadow = false
  mesh.receiveShadow = false
  group.add(mesh)

  const rows = Math.max(1, Math.round(areaD / 0.85))
  const perRow = Math.ceil(count / rows)
  const baseX = new Float32Array(count)
  const baseY = new Float32Array(count)
  const baseZ = new Float32Array(count)
  const phase = new Float32Array(count)
  const speed = new Float32Array(count)
  const amp = new Float32Array(count)
  const size = new Float32Array(count)
  const color = new THREE.Color()

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow)
    const col = i % perRow
    const n = Math.min(perRow, count - row * perRow)
    baseX[i] = ((col + 0.5) / n) * areaW - areaW / 2 + (rng() - 0.5) * 0.34
    baseZ[i] = -row * 0.85 + (rng() - 0.5) * 0.22
    baseY[i] = row * 0.42
    phase[i] = rng() * Math.PI * 2
    speed[i] = 5.5 + rng() * 5 // rad/s — some pogo, some vibrate
    amp[i] = 0.35 + rng() * 0.85
    size[i] = 0.82 + rng() * 0.36
    const pick = palette[Math.floor(rng() * palette.length)]
    // v2.1 §27 team shirts: with teamColors=[hexA, hexB], every 8th seat wears
    // team A and every 8th (offset 4) team B — 12.5% each, deterministic,
    // evenly scattered through the rows. The rng draw count is IDENTICAL with
    // or without teamColors, so an untinted crowd renders exactly as v2.0 did.
    const team = teamColors ? (i % 8 === 0 ? 0 : (i % 8 === 4 ? 1 : -1)) : -1
    const teamCol = team >= 0 ? (teamColors[team] ?? null) : null
    color.set(teamCol ?? pick)
    const jit = teamCol != null ? 0.3 : 1 // shirts jitter less — the color must read
    color.offsetHSL((rng() - 0.5) * 0.05 * jit, (rng() - 0.5) * 0.15 * jit, (rng() - 0.5) * 0.16 * jit)
    mesh.setColorAt(i, color)
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

  // bleacher risers
  if (opts.risers !== false) {
    const riserMat = flatMat(opts.riserColor ?? 0x3a4252)
    for (let r = 1; r < rows; r++) {
      const hgt = r * 0.42
      const riser = new THREE.Mesh(new THREE.BoxGeometry(areaW + 0.7, hgt, 0.85), riserMat)
      riser.position.set(0, hgt / 2, -r * 0.85)
      group.add(riser)
    }
  }

  // knock-over state: index -> { phase: 'fall'|'down'|'rise', t, timer, ztilt,
  //                              dx, dz } — (dx, dz) = unit local fall direction
  const tipped = new Map()
  let time = rng() * 10
  let hypeExtra = 0

  const _pos = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _eul = new THREE.Euler()
  const _scl = new THREE.Vector3()
  const _m = new THREE.Matrix4()
  const _axis = new THREE.Vector3()
  const _roll = new THREE.Quaternion()

  function composeUpright(i, hype) {
    const s = Math.sin(time * speed[i] + phase[i])
    const a = Math.abs(s) * amp[i] * hype
    const stretch = 0.78 + 0.5 * Math.abs(s) * (0.6 + 0.4 * hype)
    _pos.set(baseX[i], baseY[i] + a * bounceH, baseZ[i])
    _eul.set(0, 0, Math.sin(time * speed[i] * 0.5 + phase[i]) * 0.06)
    _quat.setFromEuler(_eul)
    _scl.set(size[i] / Math.sqrt(stretch), size[i] * stretch, size[i] / Math.sqrt(stretch))
    _m.compose(_pos, _quat, _scl)
    mesh.setMatrixAt(i, _m)
  }

  function composeTipped(i, st) {
    let k
    if (st.phase === 'fall') k = easeOutBack(st.t)
    else if (st.phase === 'down') k = 1 + Math.sin(time * 6 + phase[i]) * 0.011 // helpless wiggle
    else k = 1 - easeInOut(st.t)
    _pos.set(baseX[i], baseY[i], baseZ[i])
    // tip about the horizontal axis perpendicular to the fall direction, so
    // the blob keels over toward (dx, dz) with its feet planted
    _axis.set(st.dz, 0, -st.dx)
    _quat.setFromAxisAngle(_axis, 1.75 * k)
    _eul.set(0, 0, st.ztilt)
    _roll.setFromEuler(_eul)
    _quat.multiply(_roll)
    _scl.set(size[i], size[i], size[i])
    _m.compose(_pos, _quat, _scl)
    mesh.setMatrixAt(i, _m)
  }

  // Compose every instance NOW (a fresh InstancedMesh carries identity
  // matrices — the crowd must be correct even before its first update) and
  // give the mesh a bounding sphere that actually covers the placed instances
  // so raycasts (camera occlusion fades) stay honest. Rendering never trusts
  // that sphere again — frustumCulled is off for good (see above).
  for (let i = 0; i < count; i++) composeUpright(i, 1)
  mesh.instanceMatrix.needsUpdate = true
  try { mesh.computeBoundingSphere?.() } catch (e) { /* older three — culling is off anyway */ }

  return {
    group,
    mesh,
    count,

    update(dt) {
      time += dt
      hypeExtra = Math.max(0, hypeExtra - dt * 1.4)
      const hype = 1 + hypeExtra
      for (let i = 0; i < count; i++) {
        const st = tipped.get(i)
        if (!st) { composeUpright(i, hype); continue }
        if (st.phase === 'fall') {
          st.t = Math.min(1, st.t + dt / 0.32)
          if (st.t >= 1) { st.phase = 'down'; st.timer = 2.2 + rng() * 2.5 }
        } else if (st.phase === 'down') {
          st.timer -= dt
          if (st.timer <= 0) { st.phase = 'rise'; st.t = 0 }
        } else {
          st.t = Math.min(1, st.t + dt / 0.5)
          if (st.t >= 1) { tipped.delete(i); composeUpright(i, hype); continue }
        }
        composeTipped(i, st)
      }
      mesh.instanceMatrix.needsUpdate = true
    },

    // Everybody LOSES THEIR MINDS. Strength stacks, decays on its own.
    cheer(strength = 1) { hypeExtra = Math.min(3, hypeExtra + strength) },

    // dir: undefined | +1/-1 | { x, z } — see the header comment. Victims tip
    // AWAY from the impact, i.e. along the impact's direction of travel.
    knockOver(i, dir) {
      if (i < 0 || i >= count || tipped.has(i)) return false
      let dx = 0, dz = -1 // default: backward into the stands
      if (typeof dir === 'number' && dir) {
        dx = Math.sign(dir)
        dz = -0.35 // swept along the row, still leaning into the stands
      } else if (dir && typeof dir === 'object') {
        dx = dir.x ?? 0
        dz = dir.z ?? 0
      }
      // never dump a spectator forward through the barrier onto the floor
      if (dz > 0) dz = 0
      let len = Math.hypot(dx, dz)
      if (len < 1e-4) { dx = 0; dz = -1; len = 1 }
      tipped.set(i, {
        phase: 'fall', t: 0, timer: 0,
        ztilt: (rng() - 0.5) * 0.5,
        dx: dx / len, dz: dz / len,
      })
      return true
    },

    knockOverRandom(n = 3, dir) {
      let done = 0
      for (let tries = 0; tries < n * 6 && done < n; tries++) {
        if (this.knockOver(Math.floor(rng() * count), dir)) done++
      }
      return done
    },

    dispose() {
      geo.dispose()
      mat.dispose()
      if (mesh.dispose) mesh.dispose()
    },
  }
}

// ---------------------------------------------------------------------------
// autoTagCameraOccluders (v2.1 §27) — one-shot post-build scan of an arena's
// dressing that guarantees the camera's occlusion fade has enough eligible
// occluders WITHOUT any arena opting in by hand:
//   - every mesh whose world bounding box reaches above `minY` (1.2 m) AND
//     overlaps the play volume (arena bounds + `pad` of camera-roam slack)
//     gets userData.camOccluder = true — fighter-hiding dressing is tagged,
//     floors/low clutter are not;
//   - every crowd (group/mesh named *crowd* or userData.isCrowd) is HARDENED:
//     all its descendants are marked isCrowd (the camera applies its strict
//     "only fade when genuinely between lens and fighter AND the camera is
//     low" rule to them) and any InstancedMesh inside gets frustumCulled
//     switched off — this also fixes the vanish bug for the custom
//     dogCrowd/penguinCrowd builders that don't go through buildCrowd.
// Idempotent (marker on root.userData). ArenaBase.update() runs it lazily on
// the first frame, when the subclass constructor has finished building.
// ---------------------------------------------------------------------------
export function autoTagCameraOccluders(root, bounds = {}, opts = {}) {
  if (!root || !root.isObject3D || root.userData._camOccTagged) return 0
  root.userData._camOccTagged = true
  const minY = opts.minY ?? 1.2
  const pad = opts.pad ?? 3 // camera roams to bounds + wallSlack (2.2) + shake
  const minX = (bounds.minX ?? -9) - pad
  const maxX = (bounds.maxX ?? 9) + pad
  const minZ = (bounds.minZ ?? -5.5) - pad
  const maxZ = (bounds.maxZ ?? 5.5) + pad
  try { root.updateMatrixWorld(true) } catch (e) { /* detached root — boxes may be local */ }
  const box = new THREE.Box3()
  let n = 0
  root.traverse((o) => {
    if (o.userData?.isCrowd || /crowd/i.test(o.name || '')) {
      o.traverse((c) => {
        c.userData.isCrowd = true
        if (c.isInstancedMesh) c.frustumCulled = false
      })
      return
    }
    if (!o.isMesh || !o.geometry || o.name === 'skyDome') return
    if (o.userData.camOccluder || o.userData.noCameraFade) return
    const g = o.geometry
    if (!g.boundingBox) { try { g.computeBoundingBox() } catch (e) { return } }
    if (!g.boundingBox) return
    box.copy(g.boundingBox).applyMatrix4(o.matrixWorld)
    if (!(box.max.y > minY)) return
    if (box.max.x < minX || box.min.x > maxX) return
    if (box.max.z < minZ || box.min.z > maxZ) return
    o.userData.camOccluder = true
    n++
  })
  return n
}

// ---------------------------------------------------------------------------
// addBreakableProp — defensive wrapper around physics.addProp. Returns the
// handle or null (physics module may still be a stub mid-build).
// ---------------------------------------------------------------------------
export function addBreakableProp(physics, mesh, opts = {}) {
  if (!physics || typeof physics.addProp !== 'function') return null
  try {
    return physics.addProp(mesh, { shape: 'box', mass: 4, breakable: true, health: 20, ...opts })
  } catch (e) {
    console.warn('[arena] addProp failed', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// ArenaBase — base class arenas may extend. Manages the root group, tracked
// event listeners, per-frame updaters, physics prop handles and teardown.
// Subclasses build everything in their constructor and override nothing but
// (optionally) update()/onRagdollLaunch().
// ---------------------------------------------------------------------------
export class ArenaBase {
  constructor(ctx = {}) {
    this.ctx = ctx
    this.scene = ctx.scene || null
    this.physics = ctx.physics || null
    this.quality = ctx.quality || {}
    this.events = ctx.events || null
    this.audio = ctx.audio || null

    this.group = new THREE.Group()
    this.group.name = 'arena'
    // v2.0 free-roam: bounds carry a z range (fight floor depth). Arenas
    // override per venue; anything that forgets still gets the ±5.5 default.
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.5 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this.props = []        // physics prop handles
    this._updaters = []
    this._offs = []        // event unsubscribers
    this._disposers = []
    this._disposed = false
    this._occTagged = false

    // v2.1 §27 team shirts: stash the matchup colors BEFORE the subclass
    // constructor runs its crowd builds, so buildCrowd picks them up.
    this._ownsMatchColors = false
    if (ctx.fighterColors != null) {
      setMatchColors(ctx.fighterColors)
      this._ownsMatchColors = true
    }
  }

  // Alternate seam for the same thing (call before arenaDef.build()).
  static setMatchColors(colors) { setMatchColors(colors) }

  addUpdater(fn) { this._updaters.push(fn) }

  listen(name, fn) {
    if (!this.events || typeof this.events.on !== 'function') return
    this._offs.push(this.events.on(name, fn))
  }

  onDispose(fn) { this._disposers.push(fn) }

  emit(name, payload) { this.events?.emit?.(name, payload) }

  sfx(name, opts) { try { this.audio?.sfx?.(name, opts) } catch (e) { /* silent arena */ } }

  addStaticBox(center, size) {
    try { this.physics?.addStaticBox?.(center, size) } catch (e) { console.warn('[arena] addStaticBox failed', e) }
  }

  // v2.0 free-roam: invisible physics walls on ALL FOUR sides, inner faces
  // sitting exactly at this.bounds (ragdolls and props smack into them;
  // fighters clamp via bounds). Call AFTER assigning this.bounds.
  // opts: { height = 8, thickness = 1.6, pad = 3 } — pad overhangs the
  // corners so nothing slips through a seam at a diagonal.
  addBoundsWalls(opts = {}) {
    const b = this.bounds || {}
    const minX = b.minX ?? -9
    const maxX = b.maxX ?? 9
    const minZ = b.minZ ?? -5.5
    const maxZ = b.maxZ ?? 5.5
    const h = opts.height ?? 8
    const th = opts.thickness ?? 1.6
    const pad = opts.pad ?? 3
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const cy = h / 2
    const spanX = (maxX - minX) + th * 2 + pad
    const spanZ = (maxZ - minZ) + th * 2 + pad
    this.addStaticBox(new THREE.Vector3(minX - th / 2, cy, cz), new THREE.Vector3(th, h, spanZ))
    this.addStaticBox(new THREE.Vector3(maxX + th / 2, cy, cz), new THREE.Vector3(th, h, spanZ))
    this.addStaticBox(new THREE.Vector3(cx, cy, minZ - th / 2), new THREE.Vector3(spanX, h, th))
    this.addStaticBox(new THREE.Vector3(cx, cy, maxZ + th / 2), new THREE.Vector3(spanX, h, th))
  }

  addBreakable(mesh, opts) {
    const handle = addBreakableProp(this.physics, mesh, opts)
    if (handle) this.props.push(handle)
    return handle
  }

  update(dt) {
    // Lazy one-shot: by the first update the subclass constructor has built
    // all its dressing — tag the occluders + harden the crowds (§27). Every
    // arena calls super.update(dt), so this runs for all of them.
    if (!this._occTagged) {
      this._occTagged = true
      try { autoTagCameraOccluders(this.group, this.bounds) } catch (e) { /* best-effort */ }
    }
    for (const fn of this._updaters) fn(dt)
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    if (this._ownsMatchColors) setMatchColors(null) // never leak into the next build
    for (const off of this._offs) { try { off() } catch (e) { /* fine */ } }
    this._offs.length = 0
    for (const h of this.props) { try { h?.remove?.() } catch (e) { /* fine */ } }
    this.props.length = 0
    for (const fn of this._disposers) { try { fn() } catch (e) { /* fine */ } }
    this._disposers.length = 0
    this._updaters.length = 0
    if (this.scene) this.scene.remove(this.group)
    disposeObject(this.group)
  }
}
