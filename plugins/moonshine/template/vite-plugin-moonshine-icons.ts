import type { Plugin } from 'vite'
import { promises as fs, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Tabler icons for diagram tiles (a SpecNode with `icon: 'tabler:<name>'`).
//
// The set has over 5,000 icons, so readers only get the ones an article
// uses: the virtual module `virtual:moonshine-icons` exports the path data
// of every `tabler:<name>` found in the project's figure files and saved
// diagrams. It is built in dev and in `vite build` alike.
//
// The diagram editor needs the rest, to search and to show an icon the
// moment it is picked. Those come from two dev-only routes:
//   GET /__moonshine/icons/tabler?q=<text>   → up to 60 { name, paths }
//   GET /__moonshine/icons/tabler/<name>     → { name, paths }
//
// Without @tabler/icons installed the module is empty and the routes
// return nothing; built-in glyphs and emoji still work.

const VIRTUAL = 'virtual:moonshine-icons'
const RESOLVED = '\0' + VIRTUAL
const USE_RE = /tabler:([a-z0-9-]+)/g

type Nodes = Record<string, [string, { d?: string }][]>
type Meta = Record<string, { tags?: (string | number)[]; category?: string }>

export default function moonshineIconsPlugin(): Plugin {
  let root = process.cwd()
  let nodes: Nodes | null | undefined
  let meta: Meta | null | undefined

  const pkg = () => path.resolve(root, 'node_modules/@tabler/icons')
  const loadNodes = (): Nodes | null => {
    if (nodes === undefined) {
      const file = path.join(pkg(), 'tabler-nodes-outline.json')
      nodes = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Nodes) : null
    }
    return nodes
  }
  const loadMeta = (): Meta | null => {
    if (meta === undefined) {
      const file = path.join(pkg(), 'icons.json')
      meta = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Meta) : null
    }
    return meta
  }
  const pathsOf = (name: string): string[] | null => {
    const icon = loadNodes()?.[name]
    if (!icon) return null
    return icon.flatMap(([tag, attrs]) => (tag === 'path' && attrs.d ? [attrs.d] : []))
  }

  // Every tabler:<name> in the article's figure code and saved diagrams.
  async function used(): Promise<string[]> {
    const found = new Set<string>()
    async function walk(dir: string, exts: string[]) {
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) await walk(p, exts)
        else if (exts.some((x) => e.name.endsWith(x))) {
          for (const m of (await fs.readFile(p, 'utf8')).matchAll(USE_RE)) found.add(m[1])
        }
      }
    }
    await walk(path.resolve(root, 'src/figures'), ['.ts', '.tsx'])
    await walk(path.resolve(root, 'content'), ['.json', '.md'])
    return [...found].sort()
  }

  return {
    name: 'moonshine-icons',
    configResolved(config) {
      root = config.root
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null
    },
    async load(id) {
      if (id !== RESOLVED) return null
      const out: Record<string, string[]> = {}
      for (const name of await used()) {
        const p = pathsOf(name)
        if (p) out[name] = p
        else this.warn(`diagram icon tabler:${name} is not in @tabler/icons`)
      }
      return `export default ${JSON.stringify(out)}`
    },
    configureServer(server) {
      server.middlewares.use('/__moonshine/icons/tabler', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'GET') return send(405, { error: 'method not allowed' })
        const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
        if (name) {
          const paths = /^[a-z0-9-]+$/.test(name) ? pathsOf(name) : null
          return paths ? send(200, { name, paths }) : send(404, { error: 'no such icon' })
        }
        const all = loadNodes()
        if (!all) return send(200, { installed: false, icons: [] })
        const q = (url.searchParams.get('q') ?? '').toLowerCase().trim()
        const words = q.split(/\s+/).filter(Boolean)
        const tags = loadMeta()
        // Name matches first (exact, then prefix, then anywhere), then tags.
        const scored: [number, string][] = []
        for (const n of Object.keys(all)) {
          if (!words.length) continue
          const hay = `${n} ${(tags?.[n]?.tags ?? []).join(' ')} ${tags?.[n]?.category ?? ''}`.toLowerCase()
          if (!words.every((w) => hay.includes(w))) continue
          const score = n === q ? 0 : n.startsWith(words[0]) ? 1 : words.every((w) => n.includes(w)) ? 2 : 3
          scored.push([score, n])
        }
        scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1]))
        send(200, {
          installed: true,
          icons: scored.slice(0, 60).map(([, n]) => ({ name: n, paths: pathsOf(n) ?? [] })),
        })
      })
    },
  }
}
