import { useEffect, useRef, useState } from 'react'
import type { FigureProps } from '../registry'
import './sims.css'

// A local-state simulation of the two surfaces that write one project.
// The author saves from the browser; the agent edits files from the
// terminal. Both land in content/, and git records which was which:
// a browser save is committed as `moonshine-edit: <file> (<what>)`
// (vite-plugin-moonshine-edit.ts), the agent's commits carry no prefix.
//
// The messages are the ones the harness writes: "(prose)" for any body
// save, which includes a diagram's JSON, and the frontmatter key for a
// title or lede. The agent only touches the markdown here: the
// arrangement in content/figures/*.json is the author's (STILL.md, "Rules
// for agents"). Before it edits, the agent reads the author's commits
// since its own last one, which the terminal pane shows.
//
// Deterministic: each side cycles a fixed list. Plain HTML, so it reflows
// on a phone instead of shrinking.

type Surface = 'author' | 'agent'
type FileKey = 'guide.md' | 'figures/pipeline.json'
type Edit = { file: FileKey; content: string; message: string; did: string }
type Commit = { seq: number; surface: Surface; message: string }

const AUTHOR_EDITS: Edit[] = [
  { file: 'guide.md', content: 'A still keeps prose and figures apart.', message: 'moonshine-edit: guide.md (prose)', did: 'rewrote the first sentence in place' },
  { file: 'figures/pipeline.json', content: '"embed": { "x": 240, "y": 56, … }', message: 'moonshine-edit: figures/pipeline.json (prose)', did: 'dragged a box and saved the diagram' },
  { file: 'guide.md', content: 'title: "The Still, Explained"', message: 'moonshine-edit: guide.md (title)', did: 'retitled the article' },
]

const AGENT_EDITS: Edit[] = [
  { file: 'guide.md', content: '## Diagrams (new section, 3 paragraphs)', message: 'add the diagrams section', did: 'git commit -m "add the diagrams section"' },
  { file: 'guide.md', content: '## Comments (new section, 2 paragraphs)', message: 'add the comments section', did: 'git commit -m "add the comments section"' },
  { file: 'guide.md', content: 'Fixed two broken term links.', message: 'fix term links', did: 'git commit -m "fix term links"' },
]

const FILES: FileKey[] = ['guide.md', 'figures/pipeline.json']
const INITIAL_FILES: Record<FileKey, string> = {
  'guide.md': 'A still is a project for one article.',
  'figures/pipeline.json': '"embed": { "x": 392, "y": 56, … }',
}
const INITIAL_LOG: Commit[] = [
  { seq: 2, surface: 'agent', message: 'draft the first section' },
  { seq: 1, surface: 'agent', message: 'moonshine still scaffold' },
]

// A short hash that is the same on every visit.
function hashFor(seq: number): string {
  return ((seq * 2654435761) >>> 0).toString(16).padStart(8, '0').slice(0, 7)
}

const PREFIX = 'moonshine-edit:'

export default function DualSurfaceSim(_props: FigureProps) {
  const [files, setFiles] = useState(INITIAL_FILES)
  const [log, setLog] = useState(INITIAL_LOG)
  const [last, setLast] = useState<{ surface: Surface; file: FileKey } | null>(null)
  const [authorDid, setAuthorDid] = useState('nothing yet')
  // Author commits the agent has not read yet, and how many it read last.
  const [unread, setUnread] = useState(0)
  const [agentRead, setAgentRead] = useState<number | null>(null)
  const [agentDid, setAgentDid] = useState('')
  const idx = useRef({ author: 0, agent: 0 })
  const timer = useRef<number | null>(null)

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), [])

  function edit(surface: Surface) {
    const list = surface === 'author' ? AUTHOR_EDITS : AGENT_EDITS
    const e = list[idx.current[surface]++ % list.length]
    setFiles((f) => ({ ...f, [e.file]: e.content }))
    setLog((l) => [{ seq: l[0].seq + 1, surface, message: e.message }, ...l].slice(0, 6))
    setLast({ surface, file: e.file })
    if (surface === 'author') {
      setAuthorDid(e.did)
      setUnread((n) => n + 1)
    } else {
      setAgentRead(unread)
      setUnread(0)
      setAgentDid(e.did)
    }
    // The highlight on the touched file fades by itself.
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLast(null), 1600)
  }

  return (
    <div className="mn-sim mn-dual-sim">
      <p className="figure-hint">make a few edits from each side and read the log</p>

      <div className="mn-dual-surfaces">
        <div className="mn-dual-surface" data-who="author">
          <div className="mn-sim-pane-name">Author · browser</div>
          <p className="mn-dual-did">{authorDid}</p>
          <button type="button" onClick={() => edit('author')}>
            Save an edit in the page
          </button>
        </div>
        <div className="mn-dual-surface" data-who="agent">
          <div className="mn-sim-pane-name">Agent · terminal</div>
          <p className="mn-dual-did mn-dual-term" aria-live="polite">
            {agentRead === null ? (
              '$'
            ) : (
              <>
                $ git log --oneline -- content/
                {'\n'}
                {agentRead > 0
                  ? `${agentRead} ${PREFIX} commit${agentRead > 1 ? 's' : ''} since mine: keep that wording`
                  : `no ${PREFIX} commits since mine`}
                {'\n'}$ {agentDid}
              </>
            )}
          </p>
          <button type="button" onClick={() => edit('agent')}>
            Edit a file
          </button>
        </div>
      </div>

      <div className="mn-dual-repo">
        <div>
          <div className="mn-sim-pane-name">content/</div>
          {FILES.map((f) => (
            <div key={f} className="mn-dual-file" data-on={last?.file === f ? last.surface : undefined}>
              <div className="mn-dual-file-name">{f}</div>
              <div className="mn-dual-file-body">{files[f]}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mn-sim-pane-name">git log --oneline</div>
          <ol className="mn-dual-log" aria-live="polite">
            {log.map((c) => (
              <li key={c.seq} data-who={c.surface}>
                <span className="mn-dual-hash">{hashFor(c.seq)}</span>{' '}
                {c.message.startsWith(PREFIX) ? (
                  <>
                    <strong>{PREFIX}</strong>
                    {c.message.slice(PREFIX.length)}
                  </>
                ) : (
                  c.message
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
