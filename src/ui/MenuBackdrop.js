// Shared low-poly 3D backdrop for the front-end screens: synthwave grid floor,
// giant spinning W-coin, Wally silhouette on a winner's podium, and floating
// green/red candlesticks. One lazy singleton reused by title/menu/select/results.
import * as THREE from 'three'

let _instance = null

export function getBackdrop(game) {
  if (!_instance) _instance = new MenuBackdrop(game)
  return _instance
}

class MenuBackdrop {
  constructor(game) {
    this.game = game
    this.t = 0

    this.scene = new THREE.Scene()
    this.scene.background = this._makeSkyTexture()
    this.scene.fog = new THREE.Fog(0x120826, 9, 44)

    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 120)
    this.camera.position.set(0, 1.7, 7.4)
    this.camera.lookAt(0, 1.4, -1)

    // lights
    this.scene.add(new THREE.AmbientLight(0x8899ff, 0.85))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(4, 7, 4)
    this.scene.add(key)
    const rim = new THREE.PointLight(0xff4bd8, 60, 26)
    rim.position.set(-5, 3.5, 2.5)
    this.scene.add(rim)

    // synthwave grid floor
    const grid = new THREE.GridHelper(90, 64, 0x2bff88, 0x14663c)
    grid.position.y = 0
    this.scene.add(grid)

    this._buildCoin()
    this._buildPodium()
    this._buildCandles()

    this._onResize = () => {
      this.camera.aspect = innerWidth / innerHeight
      this.camera.updateProjectionMatrix()
    }
    addEventListener('resize', this._onResize)
  }

  _makeSkyTexture() {
    const c = document.createElement('canvas')
    c.width = 2
    c.height = 512
    const g = c.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, '#05030f')
    grad.addColorStop(0.5, '#170a2e')
    grad.addColorStop(0.76, '#3d1160')
    grad.addColorStop(0.85, '#7a1fa2')
    grad.addColorStop(1, '#0c1a3f')
    g.fillStyle = grad
    g.fillRect(0, 0, 2, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  _coinFaceTexture() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = '#f7c948'
    g.fillRect(0, 0, 128, 128)
    g.strokeStyle = '#b8860b'
    g.lineWidth = 8
    g.beginPath()
    g.arc(64, 64, 52, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#8a6407'
    g.font = 'bold 78px Impact, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('W', 64, 70)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  _buildCoin() {
    this.coin = new THREE.Group()
    const gold = new THREE.MeshStandardMaterial({ color: 0xf7c948, metalness: 0.72, roughness: 0.3 })
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.18, 28, 1, false), gold)
    edge.rotation.x = Math.PI / 2
    this.coin.add(edge)
    const faceTex = this._coinFaceTexture()
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.5, roughness: 0.4 })
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.13, 28), faceMat)
      face.position.z = side * 0.095
      if (side < 0) face.rotation.y = Math.PI
      this.coin.add(face)
    }
    this.coin.position.set(2.5, 2.5, -1.2)
    this.scene.add(this.coin)
  }

  _buildPodium() {
    const group = new THREE.Group()
    const podMat = new THREE.MeshStandardMaterial({ color: 0x2a2f4a, metalness: 0.15, roughness: 0.8 })
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf7c948, metalness: 0.7, roughness: 0.35 })

    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.4), podMat)
    pod.position.y = 0.55
    group.add(pod)
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.12, 1.48), trimMat)
    trim.position.y = 1.1
    group.add(trim)

    // Wally silhouette — chunky dark elephant made of primitives. Two stops
    // brighter than pure black so the shape reads as a statue gag, not a
    // rendering error, against the dark grid.
    const sil = new THREE.Group()
    const dark = new THREE.MeshStandardMaterial({ color: 0x262b4d, metalness: 0.1, roughness: 0.85 })
    const add = (geo, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, dark)
      m.position.set(x, y, z)
      m.rotation.x = rx
      m.rotation.z = rz
      sil.add(m)
      return m
    }
    // legs
    add(new THREE.BoxGeometry(0.3, 0.55, 0.32), -0.25, 0.28, 0.18)
    add(new THREE.BoxGeometry(0.3, 0.55, 0.32), -0.25, 0.28, -0.18)
    add(new THREE.BoxGeometry(0.3, 0.55, 0.32), 0.3, 0.28, 0.18)
    add(new THREE.BoxGeometry(0.3, 0.55, 0.32), 0.3, 0.28, -0.18)
    // body + chest
    add(new THREE.BoxGeometry(1.15, 0.85, 0.8), 0.02, 0.95, 0)
    add(new THREE.BoxGeometry(0.8, 0.7, 0.72), 0.35, 1.35, 0)
    // head + ears
    add(new THREE.BoxGeometry(0.55, 0.5, 0.5), 0.62, 1.85, 0)
    add(new THREE.BoxGeometry(0.06, 0.42, 0.4), 0.5, 1.95, 0.32, 0.25)
    add(new THREE.BoxGeometry(0.06, 0.42, 0.4), 0.5, 1.95, -0.32, -0.25)
    // trunk (raised — victorious)
    add(new THREE.BoxGeometry(0.16, 0.42, 0.16), 0.92, 1.72, 0, 0, -0.5)
    add(new THREE.BoxGeometry(0.14, 0.4, 0.14), 1.1, 1.98, 0, 0, -1.1)
    add(new THREE.BoxGeometry(0.12, 0.3, 0.12), 1.16, 2.24, 0, 0, -0.3)
    sil.position.y = 1.16
    group.add(sil)
    this.silhouette = sil

    group.position.set(-2.6, 0, -0.8)
    group.rotation.y = 0.35
    this.scene.add(group)
    // dim purple fill aimed at the statue so the elephant-on-plinth reads
    const statueGlow = new THREE.PointLight(0xb45bff, 30, 10, 2)
    statueGlow.position.set(-1.3, 2.6, 1.6)
    this.scene.add(statueGlow)
  }

  _buildCandles() {
    this.candles = []
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x2bff6a })
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff3b4d })
    for (let i = 0; i < 14; i++) {
      const up = Math.random() > 0.42
      const h = 0.35 + Math.random() * 0.75
      const grp = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), up ? greenMat : redMat)
      grp.add(body)
      const wick = new THREE.Mesh(new THREE.BoxGeometry(0.035, h * 1.8, 0.035), up ? greenMat : redMat)
      grp.add(wick)
      grp.position.set((Math.random() * 2 - 1) * 9, Math.random() * 8, -2.5 - Math.random() * 7)
      this.scene.add(grp)
      this.candles.push({ grp, speed: 0.45 + Math.random() * 0.85, sway: Math.random() * Math.PI * 2 })
    }
  }

  update(dt) {
    this.t += dt
    const t = this.t
    this.coin.rotation.y = t * 1.35
    this.coin.position.y = 2.5 + Math.sin(t * 1.6) * 0.18
    this.silhouette.rotation.z = Math.sin(t * 1.2) * 0.02
    this.silhouette.position.y = 1.16 + Math.abs(Math.sin(t * 2.4)) * 0.05
    this.camera.position.x = Math.sin(t * 0.21) * 0.7
    this.camera.position.y = 1.7 + Math.sin(t * 0.33) * 0.14
    this.camera.lookAt(0, 1.4, -1)
    for (const c of this.candles) {
      c.grp.position.y += c.speed * dt
      c.grp.position.x += Math.sin(t * 0.8 + c.sway) * dt * 0.25
      if (c.grp.position.y > 9.5) {
        c.grp.position.y = -0.5
        c.grp.position.x = (Math.random() * 2 - 1) * 9
      }
    }
  }

  render(renderer) {
    renderer.render(this.scene, this.camera)
  }
}
