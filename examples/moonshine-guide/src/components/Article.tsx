import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Link } from 'react-router-dom'
import directiveHandler from '../lib/directive-handler'
import { useArticleStore } from '../store'
import Figure from './Figure'
import Term from './Term'
import InlineViz from './InlineViz'
import EditableBlock from './EditableBlock'
import EditableField from './EditableField'
import EditChrome from './EditChrome'
import BlockReorderLayer from './BlockReorderLayer'
import MoonshineFooter from './MoonshineFooter'
import { EditProvider, fnv1a } from '../lib/EditContext'
import { FeedbackProvider } from '../lib/FeedbackContext'
import { topLevelBlocks } from '../lib/blocks'
import { animateVerticalReorder } from '../lib/reorderTransition'
import type { ArticleData } from '../lib/types'

type Props = {
  article: ArticleData
  all: ArticleData[]
}

// Block-level tags that get the editable wrapper so a Cmd/Ctrl+click opens
// the raw markdown for that block. Inline tags and our directive components
// are left alone — editing is always block-granular. Every tag points at
// the same EditableBlock, which reads the real tag from the hast node.
const editableComponents = Object.fromEntries(
  ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table'].map(
    (tag) => [tag, EditableBlock],
  ),
)

// Keep the DOM/block correspondence in sync with BlockReorderLayer. These
// are the article children that represent markdown top-level blocks.
function bodyBlockElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'header' || tag === 'footer') return false
    if (el.hasAttribute('data-footnotes')) return false
    return !(
      el.classList.contains('mn-chrome') ||
      el.classList.contains('mn-drop-indicator')
    )
  }) as HTMLElement[]
}

// Hash source slices rather than DOM text so the same block keeps its key
// after moving. The occurrence suffix makes duplicate blocks unambiguous.
function blockKeys(body: string): string[] {
  const seen = new Map<string, number>()
  return topLevelBlocks(body).map((block) => {
    const hash = fnv1a(body.slice(block.start, block.end))
    const occurrence = seen.get(hash) ?? 0
    seen.set(hash, occurrence + 1)
    return `${hash}:${occurrence}`
  })
}

function useArticleReorderTransition(
  containerRef: RefObject<HTMLElement | null>,
  body: string,
) {
  const previous = useRef<{
    keys: string[]
    tops: Map<string, number>
  } | null>(null)
  const stopAnimation = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const keys = blockKeys(body)
    const els = bodyBlockElements(container)
    if (keys.length !== els.length) {
      previous.current = null
      return
    }

    const elements = new Map(keys.map((key, i) => [key, els[i]]))
    const tops = new Map(
      Array.from(elements, ([key, el]) => [key, el.getBoundingClientRect().top]),
    )
    const old = previous.current
    // A prose edit changes one key in place. A reorder changes the index of
    // at least one surviving key, so only the latter gets movement chrome.
    const oldIndex = new Map(old?.keys.map((key, i) => [key, i]) ?? [])
    const reordered = Boolean(
      old && keys.some((key, i) => oldIndex.has(key) && oldIndex.get(key) !== i),
    )
    if (old && reordered) {
      stopAnimation.current?.()
      stopAnimation.current = animateVerticalReorder(elements, old.tops)
    }
    previous.current = { keys, tops }
  }, [body, containerRef])

  useEffect(
    () => () => {
      stopAnimation.current?.()
    },
    [],
  )
}

export default function Article({ article, all }: Props) {
  const clearPinned = useArticleStore((s) => s.clearPinned)
  const articleRef = useRef<HTMLElement>(null)
  useArticleReorderTransition(articleRef, article.body)

  useEffect(() => {
    document.title = article.title
  }, [article.title])

  // Escape releases a pinned term highlight, matching the
  // "click again to unpin" affordance with a keyboard path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearPinned()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearPinned])

  // Sibling navigation: if this article is part of a series, surface
  // prev/next links in the footer. Computed from the typed Velite index,
  // so renames or reorders propagate automatically.
  const siblings = article.series
    ? all
        .filter((a) => a.series === article.series)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : []
  const idx = siblings.findIndex((a) => a.slug === article.slug)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null

  return (
    <EditProvider body={article.body} path={article.path}>
      <FeedbackProvider>
      <article className="article" ref={articleRef}>
        <header>
          <EditableField as="h1" fieldKey="title" value={article.title} />
          {article.description && (
            <EditableField
              as="p"
              fieldKey="description"
              value={article.description}
              className="lede"
            />
          )}
        </header>

        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkDirective, directiveHandler]}
          rehypePlugins={[rehypeKatex]}
          // react-markdown's Components type only enumerates known HTML
          // tag names; our directive handler emits dashed custom tag
          // names (mn-figure, mn-term, mn-inline-viz) that react-markdown
          // happily looks up at runtime, so we widen the type here. The
          // block tags map to EditableBlock for in-place editing in dev.
          components={
            {
              ...editableComponents,
              'mn-figure': Figure,
              'mn-term': Term,
              'mn-inline-viz': InlineViz,
            } as Record<string, unknown>
          }
        >
          {article.body}
        </ReactMarkdown>

        {(prev || next || article.series) && (
          <footer className="article-footer">
            {article.series && (
              <p>
                Part of <Link to="/">this series</Link>.
              </p>
            )}
            <p>
              {prev && (
                <>
                  ← <Link to={`/${prev.slug}`}>{prev.title}</Link>
                </>
              )}
              {prev && next && <span style={{ margin: '0 1rem' }}>·</span>}
              {next && (
                <>
                  <Link to={`/${next.slug}`}>{next.title}</Link> →
                </>
              )}
            </p>
          </footer>
        )}

        <MoonshineFooter />
        <EditChrome />
        <BlockReorderLayer containerRef={articleRef} />
      </article>
      </FeedbackProvider>
    </EditProvider>
  )
}
