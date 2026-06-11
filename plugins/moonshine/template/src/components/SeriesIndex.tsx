import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import MoonshineFooter from './MoonshineFooter'
import type { ArticleData } from '../lib/types'

type Props = {
  articles: ArticleData[]
}

// Series landing page. Renders one card per article, ordered by `order`
// in the article's frontmatter. The article whose slug is `series-index`
// (velite flattens `series/index.md` to that) is treated as the series
// intro: its description becomes the page lede. Without one, the
// lowest-order article stands in.
export default function SeriesIndex({ articles }: Props) {
  const sorted = [...articles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const intro = articles.find((a) => a.slug === 'series-index') ?? sorted[0]
  const cards = sorted.filter((a) => a.slug !== intro.slug)

  useEffect(() => {
    document.title = intro.title
  }, [intro.title])

  return (
    <article className="article">
      <header>
        <h1>{intro.title}</h1>
        {intro.description && <p className="lede">{intro.description}</p>}
      </header>

      <div className="card-list">
        {cards.map((a) => (
          <Link key={a.slug} to={`/${a.slug}`} className="card">
            {typeof a.order === 'number' && (
              <div className="card-number">
                {String(a.order).padStart(2, '0')}
              </div>
            )}
            <div className="card-title">{a.title}</div>
            {a.description && <p className="card-desc">{a.description}</p>}
            {a.tags && a.tags.length > 0 && (
              <div className="card-tags">{a.tags.join(' · ')}</div>
            )}
          </Link>
        ))}
      </div>

      <MoonshineFooter />
    </article>
  )
}
