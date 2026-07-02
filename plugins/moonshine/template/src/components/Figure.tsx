import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { figures } from '../figures/registry'
import { blockIndexAt } from '../lib/blocks'
import { useArticleStore, useFigureHighlight } from '../store'
import { EDIT_ENABLED, fnv1a, useEdit } from '../lib/EditContext'
import { useFeedback } from '../lib/FeedbackContext'
import LazyIsland from './LazyIsland'
import FigureKnobs from './FigureKnobs'

// The hast node react-markdown passes carries source offsets for the
// whole :::figure block — the knob panel uses them to rewrite the
// directive's attributes in place.
type HastNode = {
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
}

type Props = {
  id?: string
  caption?: string
  children?: React.ReactNode
  node?: HastNode
  // Everything else came from the directive's attributes and passes
  // through to the figure component as props (as strings).
  [key: string]: unknown
}

// The directive's inner content renders through the markdown component
// map, so each child block carries its source offsets. A *leading*
// heading (any level) is the figure's title, shown above the figure;
// everything after it is the caption below. Both are ordinary markdown
// blocks, so both are Cmd/Ctrl+click editable exactly like body prose.
function splitTitle(children: ReactNode): {
  title: ReactNode | null
  rest: ReactNode | null
} {
  const kids = Children.toArray(children).filter(
    (k) => !(typeof k === 'string' && k.trim() === ''),
  )
  const first = kids[0]
  const tag = isValidElement(first)
    ? ((first.props as { node?: { tagName?: string } }).node?.tagName ?? '')
    : ''
  if (/^h[1-6]$/.test(tag)) {
    return { title: first, rest: kids.length > 1 ? kids.slice(1) : null }
  }
  return { title: null, rest: kids.length > 0 ? kids : null }
}

export default function Figure({ id, caption, children, node, ...rest }: Props) {
  const { hovered, pinned } = useFigureHighlight(id)
  const { body, path, blocks, moveBlock } = useEdit()
  const { caps, startComment } = useFeedback()
  // Depend on the raw pinned ref, not the boolean: pinning a different
  // part of the same figure should re-scroll, and a boolean wouldn't
  // change between `fig.a` and `fig.b`.
  const pinnedRef = useArticleStore((s) => s.pinnedTermRef)
  const ref = useRef<HTMLElement>(null)
  const entry = id ? figures[id] : null

  // Dev-only knob panel state. Overrides apply to the live figure
  // immediately; saving writes them into the directive's attributes,
  // and once the new attrs arrive via HMR the overrides are cleared so
  // the markdown is the source of truth again.
  const [knobsOpen, setKnobsOpen] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const attrsKey = JSON.stringify(rest)
  useEffect(() => {
    setOverrides({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrsKey])

  // When a term is clicked (pinned) and points at this figure (whole or
  // any part), scroll it into view. Hovered terms don't scroll — only
  // confirm by click.
  useEffect(() => {
    if (pinned && ref.current) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ref.current.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'center',
      })
    }
  }, [pinned, pinnedRef])

  if (!id) {
    return (
      <div className="figure figure-missing">
        <p>
          Figure directive is missing an <code>id</code>. Write{' '}
          <code>:::figure{'{id=name}'}</code> with the id of a registered
          figure.
        </p>
      </div>
    )
  }

  if (!entry) {
    return (
      <figure id={id} className="figure figure-missing">
        <p>
          No figure registered for <code>{id}</code>. Add it to{' '}
          <code>src/figures/registry.ts</code>.
        </p>
        {children && <figcaption className="figure-caption">{children}</figcaption>}
      </figure>
    )
  }

  const Component = entry.component
  const cls = [
    'figure',
    entry.wide && 'figure-wide',
    // Dev-only marker for the subtle hover hint that this figure has an
    // edit affordance (the knob panel). Never present in static builds.
    EDIT_ENABLED && 'mn-editable-figure',
    pinned ? 'figure-pinned' : hovered ? 'figure-hovered' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const start = node?.position?.start?.offset
  const end = node?.position?.end?.offset
  const range: [number, number] | null =
    typeof start === 'number' && typeof end === 'number' ? [start, end] : null

  // This figure's index among top-level blocks, for the reorder controls.
  // Containment, not exact match: a non-rendering node (HTML comment)
  // right before the directive folds into this block and shifts its start.
  const figIndex = typeof start === 'number' ? blockIndexAt(blocks, start) : -1
  const moveProps = {
    onMoveUp: () => void moveBlock(figIndex, figIndex - 1),
    onMoveDown: () => void moveBlock(figIndex, figIndex + 1),
    canMoveUp: figIndex > 0,
    canMoveDown: figIndex >= 0 && figIndex < blocks.length - 1,
  }

  // Open a comment targeting this whole figure. Excerpt prefers the caption
  // (what the reader sees) and falls back to the head of the directive source.
  const onFigureComment = caps.enabled
    ? () =>
        startComment({
          kind: 'figure',
          path,
          figureId: id,
          range: range ?? undefined,
          excerpt:
            typeof caption === 'string' && caption.trim()
              ? caption
              : range
                ? body.slice(range[0], Math.min(range[1], range[0] + 160))
                : undefined,
        })
    : undefined

  // Cmd/Ctrl+click toggles the knob panel — the same gesture that edits
  // prose. Capture phase so interactive figure internals don't also
  // react; clicks inside the caption fall through to its own prose
  // editor, and clicks inside the panel are handled there.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!EDIT_ENABLED || !(e.metaKey || e.ctrlKey)) return
    const el = e.target as Element
    if (
      el.closest('figcaption') ||
      el.closest('.figure-title') ||
      el.closest('.mn-knobs')
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (!knobsOpen) setOverrides({})
    setKnobsOpen((o) => !o)
  }

  const attrs = rest as Record<string, string>
  // `caption` was destructured out of the directive's attributes for
  // rendering, so it never reaches `attrs`. Fold it back in for the knob
  // panel — it isn't a knob param, so buildAttrString carries it through
  // as an unknown attribute instead of dropping it on save.
  const sourceAttrs =
    typeof caption === 'string' ? { ...attrs, caption } : attrs

  const { title: figTitle, rest: captionContent } = splitTitle(children)

  return (
    <figure ref={ref} id={id} className={cls} onClickCapture={onClickCapture}>
      {figTitle && <div className="figure-title">{figTitle}</div>}
      <LazyIsland height={entry.height}>
        <Component figureId={id} {...attrs} {...overrides} />
      </LazyIsland>
      {EDIT_ENABLED && knobsOpen && entry.defaults && (
        <FigureKnobs
          figureId={id}
          defaults={entry.defaults}
          paramHints={entry.paramHints}
          attrs={sourceAttrs}
          overrides={overrides}
          onChange={(key, value) =>
            setOverrides((o) => ({ ...o, [key]: value }))
          }
          onClose={() => {
            setOverrides({})
            setKnobsOpen(false)
          }}
          onSaved={() => setKnobsOpen(false)}
          range={range}
          onComment={onFigureComment}
          {...moveProps}
        />
      )}
      {EDIT_ENABLED && knobsOpen && !entry.defaults && (
        <div className="mn-knobs">
          <div className="mn-knobs-title">
            <span>
              <code>{id}</code> exposes no parameters
            </span>
            <span className="mn-knobs-controls">
              <span className="mn-edit-move">
                <button
                  type="button"
                  aria-label="Move figure up"
                  title="Move figure up"
                  onClick={moveProps.onMoveUp}
                  disabled={!moveProps.canMoveUp}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move figure down"
                  title="Move figure down"
                  onClick={moveProps.onMoveDown}
                  disabled={!moveProps.canMoveDown}
                >
                  ↓
                </button>
              </span>
              {onFigureComment && (
                <button
                  type="button"
                  className="mn-edit-comment"
                  aria-label="Comment to the agent"
                  title="Comment to the agent"
                  onClick={onFigureComment}
                >
                  💬
                </button>
              )}
              <button
                type="button"
                aria-label="Close parameter panel"
                onClick={() => setKnobsOpen(false)}
              >
                ×
              </button>
            </span>
          </div>
          <p className="mn-knobs-empty">
            Export a <code>DEFAULTS</code> const from the figure file and
            register it to make this figure tunable.
          </p>
        </div>
      )}
      {(caption || captionContent) && (
        <figcaption className="figure-caption">
          {caption ?? captionContent}
        </figcaption>
      )}
    </figure>
  )
}
