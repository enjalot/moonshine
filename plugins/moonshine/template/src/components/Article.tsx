import ReactMarkdown from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import directiveHandler from '../lib/directive-handler'
import Figure from './Figure'
import Term from './Term'
import InlineViz from './InlineViz'
import MoonshineFooter from './MoonshineFooter'

type ArticleData = {
  title: string
  description?: string
  series?: string
  order?: number
  body: string
  slug: string
}

type Props = {
  article: ArticleData
  all: ArticleData[]
}

export default function Article({ article, all }: Props) {
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
    <article className="article">
      <header>
        <h1>{article.title}</h1>
        {article.description && <p className="lede">{article.description}</p>}
      </header>

      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, directiveHandler]}
        // react-markdown's Components type only enumerates known HTML
        // tag names; our directive handler emits dashed custom tag
        // names (mn-figure, mn-term, mn-inline-viz) that react-markdown
        // happily looks up at runtime, so we widen the type here.
        components={
          {
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
    </article>
  )
}
