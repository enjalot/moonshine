import { Link } from 'react-router-dom'
import MoonshineFooter from './MoonshineFooter'

type ArticleData = {
  title: string
  description?: string
  series?: string
  order?: number
  tags?: string[]
  slug: string
}

type Props = {
  articles: ArticleData[]
}

// Series landing page. Renders one card per article, ordered by `order`
// in the article's frontmatter. The article whose `order` is 0 (or
// missing) and whose `slug` is `index` is treated as the series intro:
// its description becomes the page lede.
export default function SeriesIndex({ articles }: Props) {
  const intro = articles.find((a) => a.slug === 'series-index') ?? articles[0]
  const cards = articles
    .filter((a) => a.slug !== intro.slug)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

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
