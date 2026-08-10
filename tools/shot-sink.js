// Dev-only Vite middleware: lets the running game POST framebuffer PNGs to disk.
//
// Why: visual-QA agents can't pass images to each other, but they CAN read PNG
// files. This turns "drive the game in a browser" into "write named PNGs into
// .shots/", so a harvester agent captures once and N critic agents review in
// parallel by Read()ing the files.
//
//   POST /__shot?name=wally-idle        body: raw PNG bytes   -> .shots/wally-idle.png
//   GET  /__shots                                             -> JSON list
//   POST /__shots/clear                                       -> empty the dir
//
// In the page (see Game.js `?cap=1`):  await window.__shot('wally-idle')
import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 24 * 1024 * 1024

function safeName(raw) {
  const base = String(raw || 'shot')
    .replace(/[^a-zA-Z0-9._@-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return (base || 'shot') + '.png'
}

function readBody(req, limit = MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function shotSink({ dir = '.shots' } = {}) {
  let outDir = path.resolve(process.cwd(), dir)
  let root = process.cwd()
  return {
    name: 'wcs-shot-sink',
    apply: 'serve',
    configureServer(server) {
      // Resolve against Vite's project root, not the cwd node happened to launch
      // from — the dev server is often started with an explicit root argument.
      root = server.config.root || process.cwd()
      outDir = path.resolve(root, dir)
      fs.mkdirSync(outDir, { recursive: true })

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (!url.startsWith('/__shot')) return next()

        const json = (code, obj) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }

        try {
          const u = new URL(url, 'http://localhost')

          if (u.pathname === '/__shots' && req.method === 'GET') {
            const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.png'))
            return json(200, {
              dir: outDir,
              files: files.map((f) => {
                const st = fs.statSync(path.join(outDir, f))
                return { name: f, bytes: st.size, mtime: st.mtimeMs }
              }),
            })
          }

          if (u.pathname === '/__shots/clear' && req.method === 'POST') {
            let n = 0
            for (const f of fs.readdirSync(outDir)) {
              if (f.endsWith('.png')) { fs.unlinkSync(path.join(outDir, f)); n++ }
            }
            return json(200, { cleared: n })
          }

          if (u.pathname === '/__shot' && req.method === 'POST') {
            const buf = await readBody(req)
            if (!buf.length) return json(400, { error: 'empty body' })
            // PNG magic — refuse anything else so this can't be used as a file drop.
            if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
              return json(415, { error: 'not a PNG' })
            }
            const file = safeName(u.searchParams.get('name'))
            const dest = path.join(outDir, file)
            if (path.dirname(dest) !== outDir) return json(400, { error: 'bad name' })
            fs.writeFileSync(dest, buf)
            return json(200, { ok: true, path: dest, bytes: buf.length })
          }

          return json(404, { error: 'no such shot route' })
        } catch (e) {
          return json(500, { error: String(e && e.message || e) })
        }
      })

      server.config.logger.info(`  \x1b[32m➜\x1b[0m  shot sink: POST /__shot?name=… → ${path.relative(root, outDir)}/`)
    },
  }
}

export default shotSink
