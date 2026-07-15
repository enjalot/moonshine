import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// Dev-only authorship-feedback endpoint — the web side of the harness-agnostic
// feedback protocol specified in plugins/moonshine/FEEDBACK.md.
//
// The browser (comment box + authorship HUD) and whatever agent harness
// authored the article never talk directly: they share a directory of JSON
// files under <project>/.feedback/. This plugin is the *only* code that lets
// the browser read and write those files; it knows nothing about Claude Code,
// Codex, or any specific harness. An adapter (hook / loop / daemon) on the
// other side fulfils the four verbs in FEEDBACK.md against the same files.
//
// Registered for `vite serve` only and gated behind moonshine.config.json's
// `feedback.enabled` (see vite.config.ts), so static `vite build` exports have
// no feedback surface at all and the whole subsystem is one flag away from off.
//
// Routes (all under /__moonshine/feedback):
//   POST   /            { target, comment }  → append a pending comment file
//   POST   /control     { mode }             → write control.json (accumulate/listen/paused/stopped)
//   POST   /dismiss     { id }               → mark a comment dismissed
//   POST   /address     {}                   → write address.json (deliver accumulated comments)
//   GET    /            → list comments (id, ts, status, target, comment, reply)
//   GET    /capabilities → { enabled, harness, alive, mode, control, addressRequestedAt, project }

const RESERVED = new Set(['control.json', 'heartbeat.json', 'adapter.json', 'address.json'])

// `accumulate` (the default when control.json is absent) means adapters must
// NOT drain on their own — comments pile up until the author requests
// delivery via address.json. `listen` is the explicit auto-address opt-in.
const LISTEN_MODES = new Set(['accumulate', 'listen', 'paused', 'stopped'])

// The full protocol kind set. `block` and `figure` are wired in the current
// UI; `caption`, `term`, and `selection` are reserved (accepted here so the ABI
// is forward-compatible, but no affordance emits them yet). See FEEDBACK.md.
const COMMENT_KINDS = new Set(['block', 'figure', 'caption', 'term', 'selection'])

type Json = Record<string, unknown>

async function readJSON(file: string): Promise<Json | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Json
  } catch {
    return null
  }
}

// Write atomically (temp + rename) so a poller never reads a half-written
// file — the same discipline the save endpoint uses.
async function writeJSON(file: string, value: Json): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.moonshine-tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, file)
}

function genId(): string {
  return `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function moonshineFeedbackPlugin(): Plugin {
  return {
    name: 'moonshine-feedback',
    apply: 'serve',
    configureServer(server) {
      const projectRoot = path.resolve(server.config.root)
      const project = path.basename(projectRoot)
      const feedbackDir = path.resolve(projectRoot, '.feedback')

      const send = (res: ServerResponse, status: number, body: Json) => {
        res.statusCode = status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      }

      async function readBody(req: IncomingMessage): Promise<Json> {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        if (chunks.length === 0) return {}
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json
      }

      // Route delivery back to the session that authored the article. New
      // projects persist this in moonshine.meta.json; a server launched
      // directly from Claude Code can fall back to its inherited environment.
      async function authorSessionId(): Promise<string | null> {
        const meta = await readJSON(path.join(projectRoot, 'moonshine.meta.json'))
        const value = meta?.sessionId ?? process.env.CLAUDE_CODE_SESSION_ID
        return typeof value === 'string' && value.trim() ? value.trim() : null
      }

      // List every comment file (everything that isn't a reserved control
      // file), newest first.
      async function listComments(): Promise<Json[]> {
        let names: string[]
        try {
          names = await fs.readdir(feedbackDir)
        } catch {
          return []
        }
        const out: Json[] = []
        for (const name of names) {
          if (!name.endsWith('.json') || RESERVED.has(name)) continue
          if (name.endsWith('.moonshine-tmp')) continue
          const rec = await readJSON(path.join(feedbackDir, name))
          if (rec && typeof rec.id === 'string') out.push(rec)
        }
        out.sort((a, b) => String(b.ts ?? '').localeCompare(String(a.ts ?? '')))
        return out
      }

      // Fold the installed-adapter manifest and the (optional) listener
      // heartbeat into the single capabilities object the HUD polls.
      async function capabilities(): Promise<Json> {
        const adapter = await readJSON(path.join(feedbackDir, 'adapter.json'))
        const hb = await readJSON(path.join(feedbackDir, 'heartbeat.json'))
        const control = await readJSON(path.join(feedbackDir, 'control.json'))
        const address = await readJSON(path.join(feedbackDir, 'address.json'))
        const harness =
          (adapter?.harness as string | undefined) ??
          (hb?.harness as string | undefined) ??
          null
        let alive = false
        let mode: string | null = null
        if (hb && typeof hb.ts === 'string') {
          const intervalSec = Number(hb.intervalSec) || 30
          const age = Date.now() - Date.parse(hb.ts)
          // A stopped listener writes one final heartbeat. It may be fresh,
          // but it is intentionally no longer alive.
          alive =
            hb.mode !== 'stopped' && Number.isFinite(age) && age < intervalSec * 2 * 1000
          mode = alive ? (hb.mode as string) ?? null : null
        }
        // The author's requested mode (as opposed to `mode`, which is what a
        // live listener says it is honoring). Absent file ≡ accumulate.
        const controlMode = LISTEN_MODES.has(String(control?.mode))
          ? (control?.mode as string)
          : 'accumulate'
        // address.json disappears when an adapter consumes the request, so
        // its presence means "requested but not yet picked up".
        const addressRequestedAt =
          typeof address?.requestedAt === 'string' ? address.requestedAt : null
        return { enabled: true, harness, alive, mode, control: controlMode, addressRequestedAt, project }
      }

      server.middlewares.use('/__moonshine/feedback', async (req, res) => {
        const url = (req.url || '/').split('?')[0] || '/'
        const method = req.method || 'GET'

        try {
          // ---- reads -------------------------------------------------------
          if (method === 'GET') {
            if (url === '/capabilities') {
              send(res, 200, await capabilities())
              return
            }
            if (url === '/' || url === '') {
              send(res, 200, { ok: true, comments: await listComments() })
              return
            }
            send(res, 404, { ok: false, error: 'not found' })
            return
          }

          if (method !== 'POST') {
            send(res, 405, { ok: false, error: 'method not allowed' })
            return
          }

          // CSRF guard mirrors the save endpoint: require our JSON content
          // type (cross-origin JSON forces a preflight that dies on the 405
          // above) and reject cross-site browser requests.
          const ctype = String(req.headers['content-type'] ?? '').toLowerCase()
          if (!ctype.startsWith('application/json')) {
            send(res, 403, { ok: false, error: 'content-type must be application/json' })
            return
          }
          const fetchSite = req.headers['sec-fetch-site']
          if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
            send(res, 403, { ok: false, error: 'cross-site requests are not allowed' })
            return
          }

          const payload = await readBody(req)

          // ---- create a comment -------------------------------------------
          if (url === '/' || url === '') {
            const target = payload.target as Json | undefined
            const comment = payload.comment
            if (!target || typeof target.kind !== 'string' || !COMMENT_KINDS.has(target.kind)) {
              throw httpError(400, 'target.kind must be one of block|caption|figure|term|selection')
            }
            if (typeof target.path !== 'string' || !target.path) {
              throw httpError(400, 'target.path is required')
            }
            if (typeof comment !== 'string' || !comment.trim()) {
              throw httpError(400, 'comment text is required')
            }
            const id = genId()
            const record = {
              id,
              ts: new Date().toISOString(),
              project,
              status: 'pending',
              target,
              comment: comment.trim(),
              reply: null,
              deliveredAt: null,
              addressedAt: null,
            }
            await writeJSON(path.join(feedbackDir, `${id}.json`), record)
            send(res, 200, { ok: true, id })
            return
          }

          // ---- request delivery of accumulated comments --------------------
          if (url === '/address') {
            const sessionId = await authorSessionId()
            const request: Json = {
              requestedAt: new Date().toISOString(),
            }
            if (sessionId) request.sessionId = sessionId
            await writeJSON(path.join(feedbackDir, 'address.json'), request)
            send(res, 200, { ok: true })
            return
          }

          // ---- set the listen mode (accumulate/listen/pause/stop) ----------
          if (url === '/control') {
            const mode = String(payload.mode ?? '')
            if (!LISTEN_MODES.has(mode)) {
              throw httpError(400, 'mode must be accumulate|listen|paused|stopped')
            }
            const sessionId = await authorSessionId()
            const control: Json = {
              mode,
              updatedAt: new Date().toISOString(),
            }
            if (sessionId) control.sessionId = sessionId
            await writeJSON(path.join(feedbackDir, 'control.json'), control)
            send(res, 200, { ok: true, mode })
            return
          }

          // ---- dismiss a comment ------------------------------------------
          if (url === '/dismiss') {
            const id = String(payload.id ?? '')
            if (!/^fb_[\w]+$/.test(id)) throw httpError(400, 'invalid id')
            const file = path.join(feedbackDir, `${id}.json`)
            const rec = await readJSON(file)
            if (!rec) throw httpError(404, 'comment not found')
            rec.status = 'dismissed'
            await writeJSON(file, rec)
            send(res, 200, { ok: true })
            return
          }

          send(res, 404, { ok: false, error: 'not found' })
        } catch (err) {
          const status = (err as { status?: number }).status ?? 400
          send(res, status, { ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
  }
}

function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}
