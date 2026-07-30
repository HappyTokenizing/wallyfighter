// localStorage-backed persistence with dot-path access and full error handling.
export class SaveManager {
  constructor(namespace) {
    this.ns = namespace
    try { this.data = JSON.parse(localStorage.getItem(namespace)) || {} }
    catch { this.data = {} }
  }

  get(path, fallback) {
    let node = this.data
    for (const key of path.split('.')) {
      if (node == null || typeof node !== 'object') return fallback
      node = node[key]
    }
    return node === undefined ? fallback : node
  }

  set(path, value) {
    const keys = path.split('.')
    let node = this.data
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof node[keys[i]] !== 'object' || node[keys[i]] === null) node[keys[i]] = {}
      node = node[keys[i]]
    }
    node[keys[keys.length - 1]] = value
    this._persist()
  }

  wipe() { this.data = {}; this._persist() }

  _persist() {
    try { localStorage.setItem(this.ns, JSON.stringify(this.data)) }
    catch (e) { console.warn('[save] persist failed', e) }
  }
}
