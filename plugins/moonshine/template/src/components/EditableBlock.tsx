import { createElement, type ReactNode } from 'react'
import { fnv1a, useEdit } from '../lib/EditContext'
import { useFeedback } from '../lib/FeedbackContext'
import { anchorOffset, type Comment } from '../lib/feedback'
import SourceEditor from './SourceEditor'

// react-markdown hands every component a hast `node`. For block elements
// that node carries `position` offsets pointing back into the source body
// string — the anchor the whole editor hangs on. We type only what we read.
type HastNode = {
  tagName?: string
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
}

type Props = {
  node?: HastNode
  children?: ReactNode
  className?: string
  [key: string]: unknown
}

// One renderer reused for every block-level tag (p, h2, h3, ul, ol,
// blockquote, …). react-markdown looks each tag up in the `components` map;
// we read the real tag from `node.tagName` and reproduce it, adding the
// edit affordance. In a static build `enabled` is false and this collapses
// to a plain element with zero overhead.
export default function EditableBlock({ node, children, className, ...rest }: Props) {
  const {
    enabled,
    body,
    armed,
    activeRange,
    beginEdit,
    cancelEdit,
    commitBody,
    updateDraft,
    getDraft,
    path,
    blocks,
    moveActiveBlock,
  } = useEdit()
  const { caps, startComment, comments, setHudOpen } = useFeedback()
  const tag = node?.tagName || 'p'
  const start = node?.position?.start?.offset
  const end = node?.position?.end?.offset
  const haveRange = enabled && typeof start === 'number' && typeof end === 'number'

  // This block is the one currently open for editing → render the raw
  // source slice in a textarea instead of the formatted block. Seed with
  // the in-progress draft (not the slice) so the editor survives a
  // remount when the body shifts and the range gets re-anchored.
  if (haveRange && activeRange && activeRange[0] === start && activeRange[1] === end) {
    // Reorder is by top-level block: find the section this (possibly
    // nested) block belongs to, and enable up/down at the ends.
    const ti = blocks.findIndex(
      (b) => b.start <= (start as number) && (end as number) <= b.end,
    )
    return (
      <SourceEditor
        variant="block"
        // <span> is invalid as a direct child of a list; keep the slot an li.
        wrapperTag={tag === 'li' ? 'li' : 'span'}
        initialValue={getDraft() ?? body.slice(start as number, end as number)}
        onChangeValue={updateDraft}
        onCommit={(text) => commitBody(start as number, end as number, text)}
        onCancel={cancelEdit}
        onMoveUp={() => void moveActiveBlock('up')}
        onMoveDown={() => void moveActiveBlock('down')}
        canMoveUp={ti > 0}
        canMoveDown={ti >= 0 && ti < blocks.length - 1}
        onComment={
          caps.enabled
            ? () =>
                startComment({
                  kind: 'block',
                  path,
                  range: [start as number, end as number],
                  excerpt: body.slice(start as number, end as number),
                  anchorHash: fnv1a(body),
                })
            : undefined
        }
      />
    )
  }

  if (!haveRange) {
    return createElement(tag, { className, ...rest }, children)
  }

  const cls = ['mn-block', armed ? 'mn-block-armed' : '', className].filter(Boolean).join(' ')

  // Unaddressed comments anchored inside this block surface as a badge in the
  // right margin. Only top-level blocks carry the badge, so a comment on a
  // paragraph inside a blockquote doesn't render twice (once on each level).
  const isTopLevel = blocks.some((b) => b.start === start && b.end === end)
  const open =
    isTopLevel && caps.enabled
      ? comments.filter((c) => {
          if (c.status !== 'pending' && c.status !== 'delivered') return false
          if (c.target.path !== path) return false
          const pos = anchorOffset(c, body)
          return pos !== null && (start as number) <= pos && pos < (end as number)
        })
      : []

  return createElement(
    tag,
    {
      ...rest,
      className: cls,
      // Cmd/Ctrl+click opens this block for editing. stopPropagation makes
      // the innermost editable block win when blocks nest (e.g. a paragraph
      // inside a blockquote or list item), rather than the outer container.
      onClick: (e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          e.stopPropagation()
          beginEdit(start as number, end as number)
        }
      },
    },
    children,
    open.length > 0 && <CommentBadge key="mn-comments" open={open} onOpen={() => setHudOpen(true)} />,
  )
}

// 💬 badge for a block with unaddressed comments; clicking opens the HUD
// where the full comment (and Address button) lives.
function CommentBadge({ open, onOpen }: { open: Comment[]; onOpen: () => void }) {
  return (
    <span
      className="mn-block-comments"
      role="button"
      tabIndex={0}
      title={open.map((c) => c.comment).join('\n\n')}
      aria-label={`${open.length} unaddressed comment${open.length === 1 ? '' : 's'} on this block`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      💬{open.length > 1 ? <span className="mn-block-comments-count">{open.length}</span> : null}
    </span>
  )
}
