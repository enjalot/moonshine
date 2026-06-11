import { useEffect } from 'react'
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
import MoonshineFooter from './MoonshineFooter'
import { EditProvider } from '../lib/EditContext'
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
  ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table'].map(
    (tag) => [tag, EditableBlock],
  ),
)

export default function Article({ article, all }: Props) {
  const clearPinned = useArticleStore((s) => s.clearPinned)

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
      <article className="article">
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
      </article>
    </EditProvider>
  )
}
