import { createElement, useEffect, useState } from 'react'
import { useEdit } from '../lib/EditContext'
import SourceEditor from './SourceEditor'

type Props = {
  // Frontmatter key to patch on commit (e.g. 'title', 'description').
  fieldKey: string
  value: string
  // Element to render the value as in view mode ('h1', 'p', …).
  as: string
  className?: string
}

// Cmd/Ctrl+click an editable frontmatter field (title, lede) to edit its
// scalar value. Unlike body blocks these don't live in the markdown body,
// so commit routes to the frontmatter patch path instead of a body splice.
export default function EditableField({ fieldKey, value, as, className }: Props) {
  const { enabled, armed, commitFrontmatter } = useEdit()
  const [editing, setEditing] = useState(false)
  // Optimistic value: show the committed text immediately instead of
  // flashing the stale prop for the few hundred ms until velite re-emits
  // and HMR delivers the new frontmatter.
  const [optimistic, setOptimistic] = useState<string | null>(null)
  useEffect(() => {
    if (optimistic !== null && optimistic === value) setOptimistic(null)
  }, [value, optimistic])
  const shown = optimistic ?? value

  if (enabled && editing) {
    return (
      <SourceEditor
        variant="field"
        initialValue={shown}
        onCommit={async (text) => {
          await commitFrontmatter(fieldKey, text)
          setOptimistic(text)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  if (!enabled) {
    return createElement(as, { className }, value)
  }

  const cls = ['mn-block', armed ? 'mn-block-armed' : '', className].filter(Boolean).join(' ')
  return createElement(
    as,
    {
      className: cls,
      onClick: (e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          setEditing(true)
        }
      },
    },
    value,
  )
}
