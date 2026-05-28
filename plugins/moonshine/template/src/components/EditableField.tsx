import { createElement, useState } from 'react'
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

  if (enabled && editing) {
    return (
      <SourceEditor
        variant="field"
        initialValue={value}
        onCommit={async (text) => {
          await commitFrontmatter(fieldKey, text)
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
