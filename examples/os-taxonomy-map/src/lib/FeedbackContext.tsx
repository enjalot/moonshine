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
  requestAddress as postAddress,
  type Capabilities,
  type Comment,
  type CommentTarget,
  type ListenMode,
} from './feedback'
import {
  fetchSuggestions,
  resolveSuggestion,
  type Suggestion,
  type SuggestionStatus,
} from './suggestions'

// React state layer over feedback.ts: polls capabilities + comments, holds the
// in-progress comment draft (the target a block/figure asked to comment on),
// and exposes the mutations the HUD and comment box call. All gated on
// EDIT_ENABLED so production builds never poll or render any of it.

const POLL_MS = 4000
const SHOW_SUGGESTIONS_KEY = 'moonshine-show-suggestions'

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
  requestAddress: () => Promise<void>
  // HUD panel open state lives here so per-block comment badges can open it.
  hudOpen: boolean
  setHudOpen: (open: boolean) => void
  // Suggestions an agent left for the author (every status, every article;
  // consumers filter). `showSuggestions` is the HUD toggle that reveals the
  // in-page cards; it is remembered per browser and defaults to on.
  suggestions: Suggestion[]
  showSuggestions: boolean
  setShowSuggestions: (show: boolean) => void
  decideSuggestion: (id: string, status: SuggestionStatus, appliedText?: string) => Promise<void>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<Capabilities>(DISABLED_CAPABILITIES)
  const [comments, setComments] = useState<Comment[]>([])
  const [draftTarget, setDraftTarget] = useState<CommentTarget | null>(null)
  const [hudOpen, setHudOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShow] = useState(() => {
    try {
      return localStorage.getItem(SHOW_SUGGESTIONS_KEY) !== '0'
    } catch {
      return true
    }
  })

  // Hold the latest "is the subsystem enabled?" answer in a ref so the poll
  // loop can keep running at a steady cadence without re-subscribing.
  const enabledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!EDIT_ENABLED) return
    const next = await fetchCapabilities()
    enabledRef.current = next.enabled
    setCaps(next)
    setComments(next.enabled ? await fetchComments() : [])
    setSuggestions(next.enabled ? await fetchSuggestions() : [])
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
    requestAddress: async () => {
      await postAddress()
      await refresh()
    },
    hudOpen,
    setHudOpen,
    suggestions,
    showSuggestions,
    setShowSuggestions: (show) => {
      setShow(show)
      try {
        localStorage.setItem(SHOW_SUGGESTIONS_KEY, show ? '1' : '0')
      } catch {
        // storage unavailable: the toggle still works for this page load
      }
    },
    decideSuggestion: async (id, status, appliedText) => {
      await resolveSuggestion(id, status, appliedText)
      // Drop it locally at once so the card leaves with the click instead of
      // waiting for the next poll.
      setSuggestions((all) => all.map((x) => (x.id === id ? { ...x, status } : x)))
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
