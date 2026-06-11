import type { Plugin } from 'vite'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

// Dev-only write-back endpoint for the in-place markdown editor.
//
// The browser holds the article body as a raw string and edits one block
// at a time by slicing/splicing on source offsets (see EditableBlock). When
// the author commits, it POSTs the result here and we write it to the
// `.md` file under content/. Velite's watcher then re-emits and the page
// hot-reloads. This plugin is only registered for `vite serve`, never in a
// production `vite build`, so static exports have no write path at all.
//
// Payload shapes (both keyed by the content-relative `path`):
//   { path, body, baseHash? }      → replace the markdown body wholesale.
//                                    `baseHash` is an fnv1a hash of the body
//                                    the client spliced from; if it doesn't
//                                    match the body on disk the save is
//                                    rejected with 409 instead of silently
//                                    overwriting a concurrent edit (the
//                                    author and a coding agent share these
//                                    files — see STILL.md).
//   { path, frontmatter: {k: v} }  → patch scalar frontmatter keys in place
//
// We always preserve the frontmatter block when replacing the body, and we
// preserve the body (and untouched keys) when patching frontmatter.

// Mirrors velite 0.2.4's MATTER_RE so both sides agree on exactly where
// frontmatter ends and the body begins (including empty frontmatter and
// lone-\r line endings).
const MATTER_RE = /^---(?:\r?\n|\r)(?:([\s\S]*?)(?:\r?\n|\r))?---(?:\r?\n|\r|$)/

// Frontmatter keys the endpoint will patch. All string-valued — patching
// `order:` or `tags:` through a string field would emit YAML that fails the
// velite schema and silently drops the article.
const EDITABLE_FRONTMATTER_KEYS = new Set(['title', 'description', 'series'])

type SavePayload = {
  path?: string
  body?: string
  baseHash?: string
  frontmatter?: Record<string, string>
}

// Same function exists client-side in src/lib/EditContext.tsx — keep the
// two in sync. 32-bit FNV-1a over UTF-16 code units, hex string.
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

// Extract (frontmatterInner | null, body) the same way velite's loader
// does: trim the file, strip the matter block, trim the rest.
function splitMatter(source: string): { fmInner: string | null; fmRaw: string | null; body: string } {
  const src = source.trim()
  const m = src.match(MATTER_RE)
  if (!m) return { fmInner: null, fmRaw: null, body: src }
  return {
    fmInner: m[1] ?? '',
    fmRaw: m[0].trimEnd(),
    body: src.slice(m[0].length).trim(),
  }
}

// Patch keys into a frontmatter block using a real YAML document so values
// are quoted/escaped correctly (a title of `1984` or `- dash` must stay a
// string) and untouched keys keep their comments and formatting. Returns
// the block including fences, no trailing newline.
function patchFrontmatter(inner: string, patches: Record<string, string>): string {
  const doc = inner.trim() ? YAML.parseDocument(inner) : new YAML.Document({})
  if (doc.errors.length > 0) {
    throw new Error(`frontmatter is not valid YAML: ${doc.errors[0].message}`)
  }
  // A comments-only block parses to null contents; give doc.set a map.
  if (!doc.contents) {
    doc.contents = doc.createNode({}) as unknown as typeof doc.contents
  }
  for (const [key, value] of Object.entries(patches)) {
    if (!EDITABLE_FRONTMATTER_KEYS.has(key)) {
      throw new Error(`frontmatter key not editable via this endpoint: ${key}`)
    }
    if (typeof value !== 'string') {
      throw new Error(`frontmatter value for ${key} must be a string`)
    }
    doc.set(key, value)
  }
  const yamlText = doc.toString().replace(/\n+$/, '')
  return yamlText ? `---\n${yamlText}\n---` : '---\n---'
}

export default function moonshineEditPlugin(): Plugin {
  return {
    name: 'moonshine-inline-edit',
    apply: 'serve',
    configureServer(server) {
      const contentRoot = path.resolve(server.config.root, 'content')

      // Serialize saves per file so two near-simultaneous POSTs (author +
      // agent tooling) can't interleave their read-modify-write cycles.
      const writeQueues = new Map<string, Promise<unknown>>()
      function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const prev = writeQueues.get(key) ?? Promise.resolve()
        const next = prev.then(fn, fn)
        writeQueues.set(key, next.then(() => undefined, () => undefined))
        return next
      }

      server.middlewares.use('/__moonshine/save', async (req, res) => {
        const fail = (status: number, message: string) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: message }))
        }

        if (req.method !== 'POST') {
          fail(405, 'method not allowed')
          return
        }

        // CSRF guard: a cross-origin page can fire a no-preflight POST at
        // localhost with text/plain, so require the JSON content type our
        // own client sends (cross-origin JSON forces a preflight, which
        // dies on the 405 above). Browsers that send Sec-Fetch-Site get a
        // second check; non-browser tools (curl, agents) don't send it.
        const ctype = String(req.headers['content-type'] ?? '')
        if (!ctype.toLowerCase().startsWith('application/json')) {
          fail(403, 'content-type must be application/json')
          return
        }
        const fetchSite = req.headers['sec-fetch-site']
        if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
          fail(403, 'cross-site requests are not allowed')
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const payload: SavePayload = JSON.parse(Buffer.concat(chunks).toString('utf8'))

          if (!payload.path) throw new Error('missing path')

          // Resolve and confine the target inside content/ — never let a
          // crafted `../` payload escape the content tree.
          const target = path.resolve(contentRoot, payload.path)
          if (target !== contentRoot && !target.startsWith(contentRoot + path.sep)) {
            throw new Error('path escapes content root')
          }

          await enqueue(target, async () => {
            const original = await fs.readFile(target, 'utf8')
            const { fmInner, fmRaw, body: diskBody } = splitMatter(original)

            let body = diskBody
            if (typeof payload.body === 'string') {
              // Reject the save if the file changed since the client read
              // it — splicing into a stale body would silently destroy the
              // concurrent edit. The client surfaces the 409 and keeps the
              // editor open.
              if (payload.baseHash && payload.baseHash !== fnv1a(diskBody)) {
                const err = new Error(
                  'file changed on disk since this block was opened — close the editor, let the page refresh, and re-apply your edit',
                )
                ;(err as Error & { status?: number }).status = 409
                throw err
              }
              body = payload.body
            }

            let fmBlock = fmRaw
            if (payload.frontmatter) {
              fmBlock = patchFrontmatter(fmInner ?? '', payload.frontmatter)
            }

            // Reassemble with a clean, conventional layout: frontmatter,
            // one blank line, body, single trailing newline. Files stay
            // tidy no matter which path edited.
            const cleanBody = body.replace(/^\n+/, '').replace(/\n+$/, '')
            const out = fmBlock ? `${fmBlock}\n\n${cleanBody}\n` : `${cleanBody}\n`

            // Write atomically (temp + rename) so velite's watcher never
            // reads a half-written file. The temp name doesn't match
            // `**/*.md`, so the watcher ignores the intermediate file.
            const tmp = `${target}.moonshine-tmp`
            await fs.writeFile(tmp, out, 'utf8')
            await fs.rename(tmp, target)
          })

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          const status = (err as Error & { status?: number }).status ?? 400
          fail(status, err instanceof Error ? err.message : String(err))
        }
      })
    },
  }
}
