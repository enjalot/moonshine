import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Props = {
  initialValue: string
  onCommit: (text: string) => void | Promise<void>
  onCancel: () => void
  // Reports every keystroke so the provider can preserve the draft if
  // this editor gets remounted (body shifted under it).
  onChangeValue?: (text: string) => void
  // `block` grows to fill the prose column; `field` is a single-line-ish
  // inline editor for frontmatter (title/lede). Both auto-size to content.
  variant?: 'block' | 'field'
  // Rendered wrapper element. Editing an li must keep an li in the list.
  wrapperTag?: 'span' | 'li'
  // Reorder controls (block variant only): move this block's enclosing
  // top-level section up or down. Omitted for frontmatter fields.
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  // Open a comment-to-the-agent box targeting this block. Omitted when the
  // feedback subsystem is off, which also hides the affordance.
  onComment?: () => void
}

// Auto-sizing textarea seeded with raw markdown source. Cmd/Ctrl+Enter or
// the floating check button commits; Esc cancels. Used for both body blocks
// and frontmatter fields — the only difference is chrome and font.
export default function SourceEditor({
  initialValue,
  onCommit,
  onCancel,
  onChangeValue,
  variant = 'block',
  wrapperTag = 'span',
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onComment,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  // Grow the textarea to fit its content on every change.
  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(resize, [value])

  // Focus and place the caret at the end when the editor opens.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const commit = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onCommit(value)
    } catch (err) {
      setSaving(false)
      // Surface the failure but keep the editor open so the edit isn't lost.
      // eslint-disable-next-line no-alert
      window.alert(`Could not save: ${String(err)}`)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const showMove = Boolean(onMoveUp || onMoveDown)

  const Wrapper = wrapperTag
  return (
    <Wrapper className={`mn-edit mn-edit-${variant}`}>
      <textarea
        ref={ref}
        className="mn-edit-textarea"
        value={value}
        spellCheck={false}
        disabled={saving}
        onChange={(e) => {
          setValue(e.target.value)
          onChangeValue?.(e.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      <span className="mn-edit-bar" contentEditable={false}>
        <button
          type="button"
          className="mn-edit-done"
          aria-label={saving ? 'Saving changes' : 'Save changes'}
          title="Save changes (⌘/Ctrl+Enter)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void commit()}
          disabled={saving}
        >
          <span aria-hidden>{saving ? '…' : '✓'}</span>
        </button>
        {onComment && (
          <button
            type="button"
            className="mn-edit-comment"
            aria-label="Comment to the agent"
            title="Comment to the agent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onComment}
          >
            💬
          </button>
        )}
        {showMove && (
          <span className="mn-edit-move mn-edit-move-text">
            <button
              type="button"
              aria-label="Move section up"
              title="Move section up"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onMoveUp?.()}
              disabled={saving || !canMoveUp}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Move section down"
              title="Move section down"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onMoveDown?.()}
              disabled={saving || !canMoveDown}
            >
              ↓
            </button>
          </span>
        )}
        <span className="mn-edit-hint">
          <span>⌘↵ save</span>
          <span>esc cancel</span>
        </span>
      </span>
    </Wrapper>
  )
}
