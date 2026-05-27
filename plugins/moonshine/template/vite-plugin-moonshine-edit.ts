import type { Plugin } from 'vite'
import { promises as fs } from 'node:fs'
import path from 'node:path'

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
//   { path, body }                 → replace the markdown body wholesale
//   { path, frontmatter: {k: v} }  → patch scalar frontmatter keys in place
//
// We always preserve the frontmatter block when replacing the body, and we
// preserve the body (and untouched keys) when patching frontmatter.

const FRONTMATTER_RE = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/

type SavePayload = {
  path?: string
  body?: string
  frontmatter?: Record<string, string>
}

// Emit a YAML scalar. Bare when it's safe; double-quoted (with escapes)
// when the value contains characters that would change how YAML parses
// the line. Keeps untouched files looking hand-written.
function yamlScalar(value: string): string {
  const safe = /^[^\s"'#:!&*?{}[\],>|@`%][^:#\n]*$/.test(value) && !/\s$/.test(value)
  if (safe) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// Replace `key:`'s value on its own line, or insert the pair right after
// the opening `---` if the key isn't present yet.
function patchFrontmatterKey(block: string, key: string, value: string): string {
  const line = `${key}: ${yamlScalar(value)}`
  const keyRe = new RegExp(`^${key}:.*$`, 'm')
  if (keyRe.test(block)) return block.replace(keyRe, line)
  return block.replace(/^(---\r?\n)/, `$1${line}\n`)
}

export default function moonshineEditPlugin(): Plugin {
  return {
    name: 'moonshine-inline-edit',
    apply: 'serve',
    configureServer(server) {
      const contentRoot = path.resolve(server.config.root, 'content')

      server.middlewares.use('/__moonshine/save', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('method not allowed')
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

          const original = await fs.readFile(target, 'utf8')
          const match = original.match(FRONTMATTER_RE)
          let block = match ? match[1] : ''
          let body = match ? match[2] : original

          if (typeof payload.body === 'string') {
            body = payload.body
          }
          if (payload.frontmatter) {
            if (!block) {
              // No frontmatter yet — synthesize a minimal block so the
              // patched keys have somewhere to live.
              block = '---\n---\n'
            }
            for (const [k, v] of Object.entries(payload.frontmatter)) {
              block = patchFrontmatterKey(block, k, v)
            }
          }

          // Velite hands the client a body trimmed of the blank line that
          // separates frontmatter from prose, so reassemble with a clean,
          // conventional layout: frontmatter, one blank line, body, single
          // trailing newline. Files stay tidy no matter which path edited.
          let out: string
          if (block) {
            const fm = block.replace(/\s*$/, '')
            out = `${fm}\n\n${body.replace(/^\n+/, '').replace(/\n+$/, '')}\n`
          } else {
            out = `${body.replace(/\n+$/, '')}\n`
          }
          await fs.writeFile(target, out, 'utf8')
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: String(err) }))
        }
      })
    },
  }
}
