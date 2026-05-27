import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

// Client side of the in-place markdown editor. The provider holds the raw
// article body as a string and exposes operations that edit it by source
// offset — the same offsets react-markdown reports on each block's `node`
// (see EditableBlock). Editing is therefore a pure slice/splice on the
// body string; we never serialize rendered DOM back to markdown.
//
// Everything here is gated on `import.meta.env.DEV`. In a production
// `vite build` that constant is statically `false`, so the affordances and
// the network calls are dead-code-eliminated and the article renders as a
// plain static page.

export const EDIT_ENABLED = import.meta.env.DEV

type EditContextValue = {
  enabled: boolean
  body: string
  path: string
  // Source offsets [start, end) of the block currently open for editing,
  // or null when nothing is being edited. Only one block at a time.
  activeRange: [number, number] | null
  // True while a modifier (Cmd/Ctrl) is held — used to reveal block
  // boundaries so the author knows what a click will open.
  armed: boolean
  beginEdit: (start: number, end: number) => void
  cancelEdit: () => void
  commitBody: (start: number, end: number, text: string) => Promise<void>
  commitFrontmatter: (key: string, value: string) => Promise<void>
}

const EditContext = createContext<EditContextValue | null>(null)

async function postSave(payload: Record<string, unknown>): Promise<void> {
  // Hard guard on the build-time constant. esbuild folds EDIT_ENABLED to
  // `false` in a production build, turning this into an early `return` and
  // letting it dead-code-eliminate the fetch and the endpoint string — the
  // save path is physically absent from static bundles, not just unreached.
  if (!EDIT_ENABLED) return
  const res = await fetch('/__moonshine/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`save failed (${res.status}): ${detail}`)
  }
}

type ProviderProps = {
  body: string
  path: string
  children: ReactNode
}

export function EditProvider({ body, path, children }: ProviderProps) {
  const [activeRange, setActiveRange] = useState<[number, number] | null>(null)
  const [armed, setArmed] = useState(false)

  // Track the Cmd/Ctrl modifier globally so blocks can reveal their edit
  // boundaries only while it's held — the page reads as normal prose
  // otherwise. Skip all of this when editing is disabled.
  useEffect(() => {
    if (!EDIT_ENABLED) return
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setArmed(true)
    }
    const up = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setArmed(false)
    }
    const blur = () => setArmed(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const value: EditContextValue = {
    enabled: EDIT_ENABLED,
    body,
    path,
    activeRange,
    armed,
    beginEdit: (start, end) => setActiveRange([start, end]),
    cancelEdit: () => setActiveRange(null),
    commitBody: async (start, end, text) => {
      // Splice the edited block back into the body at its exact source
      // range. Offsets came from parsing this same string, so the result
      // is guaranteed consistent. Velite's watcher re-emits after the
      // write and the page hot-reloads with the new body.
      const next = body.slice(0, start) + text + body.slice(end)
      await postSave({ path, body: next })
      setActiveRange(null)
    },
    commitFrontmatter: async (key, val) => {
      await postSave({ path, frontmatter: { [key]: val } })
    },
  }

  return <EditContext.Provider value={value}>{children}</EditContext.Provider>
}

export function useEdit(): EditContextValue {
  const ctx = useContext(EditContext)
  if (!ctx) {
    throw new Error('useEdit must be used within an EditProvider')
  }
  return ctx
}
