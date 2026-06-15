import { useEffect, useState } from 'react'
import { EDIT_ENABLED, useEdit } from '../lib/EditContext'

// Dev-only page chrome for the in-place editor: a discoverability hint,
// an undo toast after saves, and a recovery banner for interrupted
// drafts. Gated on the build-time constant so production builds
// dead-code-eliminate all of it — same pattern as the rest of the edit
// pipeline.

const HINT_DISMISSED_KEY = 'moonshine-edit-hint-dismissed'

export default function EditChrome() {
  if (!EDIT_ENABLED) return null
  return (
    <>
      <DraftRecovery />
      <UndoToast />
      <EditHint />
    </>
  )
}

// Small fixed pill telling the author the edit gesture exists. The
// affordance is otherwise invisible until you already know to hold the
// modifier. Dismissable, and stays dismissed per browser.
function EditHint() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(HINT_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed) return null
  return (
    <div className="mn-chrome mn-hint-pill" role="note">
      <span>
        ✎ hold <kbd>⌘/Ctrl</kbd>: click a block to edit prose or a figure for
        parameters, drag to reorder · <kbd>esc</kbd> unpins
      </span>
      <button
        type="button"
        aria-label="Dismiss editing hint"
        onClick={() => {
          setDismissed(true)
          try {
            localStorage.setItem(HINT_DISMISSED_KEY, '1')
          } catch {
            // ignore
          }
        }}
      >
        ×
      </button>
    </div>
  )
}

// Transient "Saved · Undo" toast after each body commit. Undo re-posts
// the previous body through the same conflict-checked save path.
function UndoToast() {
  const { canUndo, undoLastSave } = useEdit()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!canUndo) {
      setVisible(false)
      return
    }
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(t)
  }, [canUndo])

  if (!visible) return null
  return (
    <div className="mn-chrome mn-undo-toast" role="status">
      <span>Saved</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await undoLastSave()
          } catch (err) {
            // eslint-disable-next-line no-alert
            window.alert(`Could not undo: ${String(err)}`)
          } finally {
            setBusy(false)
            setVisible(false)
          }
        }}
      >
        {busy ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  )
}

// Shown when an open editor's block disappeared underneath it (the file
// changed and the draft couldn't be re-anchored). The text is parked
// here and in sessionStorage instead of vanishing.
function DraftRecovery() {
  const { stashedDraft, clearStashedDraft } = useEdit()
  if (stashedDraft == null) return null
  return (
    <div className="mn-chrome mn-draft-recovery" role="alert">
      <p>
        An edit in progress was interrupted because the file changed
        underneath it. Your draft:
      </p>
      <textarea readOnly value={stashedDraft} rows={Math.min(8, stashedDraft.split('\n').length + 1)} />
      <div className="mn-draft-recovery-actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(stashedDraft)
          }}
        >
          Copy
        </button>
        <button type="button" onClick={clearStashedDraft}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
