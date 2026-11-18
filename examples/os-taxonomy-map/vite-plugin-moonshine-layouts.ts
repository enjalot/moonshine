import { createServer, type Plugin, type ResolvedConfig } from 'vite'

// Diagram layouts made at build time, so a published article does not
// ship the layout engine.
//
// A diagram the author has not fully arranged is laid out automatically
// by ELK (elkjs), which is over a megabyte. In `npm run dev` the browser
// loads it when a diagram needs it. A build instead lays every such
// diagram out once, here, and the article carries the positions:
//
//   virtual:moonshine-layouts   → { [figureId]: { from, wide?, narrow? } }
//
// (empty in dev). The work is src/figures/diagram/bake.ts, run in Node
// through a short-lived Vite server so it sees the figures exactly as the
// article imports them.
//
// When the build could see every figure, ELK itself is left out of the
// bundle. It stays in (as a chunk readers fetch only if needed, which is
// how it always worked) when the layout step fails, or when a figure
// cannot render outside a browser and so might hold a diagram the build
// never saw. Set MOONSHINE_KEEP_ELK=1 to keep it regardless.

const VIRTUAL = 'virtual:moonshine-layouts'
const RESOLVED = '\0' + VIRTUAL
const ELK = 'elkjs/lib/elk.bundled.js'
const ELK_STUB = '\0moonshine-no-elk'

type Baked = { layouts: Record<string, unknown>; unchecked: string[] }

export default function moonshineLayoutsPlugin(): Plugin {
  let config: ResolvedConfig
  let layouts: Record<string, unknown> = {}
  let dropElk = false

  async function bake(): Promise<Baked> {
    const server = await createServer({
      root: config.root,
      configFile: config.configFile ?? false,
      mode: config.mode,
      logLevel: 'error',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    try {
      const mod = (await server.ssrLoadModule('/src/figures/diagram/bake.ts')) as { bakeLayouts: () => Promise<Baked> }
      return await mod.bakeLayouts()
    } finally {
      await server.close()
    }
  }

  return {
    name: 'moonshine-layouts',
    // Ahead of Vite's own resolver, which would find the real elkjs.
    enforce: 'pre',
    configResolved(c) {
      config = c
    },
    async buildStart() {
      if (config.command !== 'build' || config.build.ssr) return
      const say = (msg: string) => config.logger.info(`moonshine: ${msg}`)
      try {
        const out = await bake()
        layouts = out.layouts
        const n = Object.keys(layouts).length
        const keep = Boolean(process.env.MOONSHINE_KEEP_ELK) || out.unchecked.length > 0
        dropElk = !keep
        say(`${n} diagram${n === 1 ? '' : 's'} laid out at build time.`)
        if (out.unchecked.length) {
          say(
            `the layout engine stays in the bundle, because ${out.unchecked.length} figure${out.unchecked.length === 1 ? '' : 's'} could not be rendered outside a browser to check for diagrams: ${out.unchecked.join(', ')}. Readers fetch it only if a diagram needs it.`,
          )
        } else if (dropElk) say('the layout engine is left out of the bundle.')
      } catch (err) {
        layouts = {}
        dropElk = false
        config.logger.warn(
          `moonshine: could not lay diagrams out at build time (${err instanceof Error ? err.message : String(err)}). The layout engine stays in the bundle; readers fetch it only if a diagram needs it.`,
        )
      }
    },
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED
      if (id === ELK && dropElk) return ELK_STUB
      return null
    },
    load(id) {
      if (id === RESOLVED) return `export default ${JSON.stringify(layouts)}`
      if (id === ELK_STUB) {
        return `export default class { layout() { return Promise.reject(new Error('the layout engine is not part of this build')) } }`
      }
      return null
    },
  }
}
