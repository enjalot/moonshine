import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { EDIT_ENABLED } from './EditContext'
import {
  DISABLED_CAPABILITIES,
  dismissComment,
  fetchCapabilities,
  fetchComments,
  postComment,
  postControl,
  type Capabilities,
  type Comment,
  type CommentTarget,
  type ListenMode,
} from './feedback'

// React state layer over feedback.ts: polls capabilities + comments, holds the
// in-progress comment draft (the target a block/figure asked to comment on),
// and exposes the mutations the HUD and comment box call. All gated on
// EDIT_ENABLED so production builds never poll or render any of it.

const POLL_MS = 4000

type FeedbackContextValue = {
  caps: Capabilities
  comments: Comment[]
  refresh: () => Promise<void>
  // The comment box is open against this target, or null when closed.
  draftTarget: CommentTarget | null
  startComment: (target: CommentTarget) => void
  cancelComment: () => void
  submitComment: (text: string) => Promise<void>
  setMode: (mode: ListenMode) => Promise<void>
  dismiss: (id: string) => Promise<void>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<Capabilities>(DISABLED_CAPABILITIES)
  const [comments, setComments] = useState<Comment[]>([])
  const [draftTarget, setDraftTarget] = useState<CommentTarget | null>(null)

  // Hold the latest "is the subsystem enabled?" answer in a ref so the poll
  // loop can keep running at a steady cadence without re-subscribing.
  const enabledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!EDIT_ENABLED) return
    const next = await fetchCapabilities()
    enabledRef.current = next.enabled
    setCaps(next)
    setComments(next.enabled ? await fetchComments() : [])
  }, [])

  useEffect(() => {
    if (!EDIT_ENABLED) return
    void refresh()
    const t = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(t)
  }, [refresh])

  const value: FeedbackContextValue = {
    caps,
    comments,
    refresh,
    draftTarget,
    startComment: (target) => setDraftTarget(target),
    cancelComment: () => setDraftTarget(null),
    submitComment: async (text) => {
      if (!draftTarget) return
      await postComment(draftTarget, text)
      setDraftTarget(null)
      await refresh()
    },
    setMode: async (mode) => {
      await postControl(mode)
      await refresh()
    },
    dismiss: async (id) => {
      await dismissComment(id)
      await refresh()
    },
  }

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext)
  if (!ctx) {
    throw new Error('useFeedback must be used within a FeedbackProvider')
  }
  return ctx
}
