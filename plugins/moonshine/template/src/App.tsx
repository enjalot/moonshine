import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
// Velite generates .velite/index.d.ts on first run (npm run dev or
// npm run build). If the import looks unresolved in your IDE, run
// `npx velite build` once.
import { articles } from '#content'
import Article from './components/Article'
import SeriesIndex from './components/SeriesIndex'
import type { ArticleData } from './lib/types'

const all: ArticleData[] = articles

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:slug" element={<ArticleRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// Root URL: if there's only one article, render it; otherwise show the
// series index. This lets the same template work for both modes without
// any configuration switch — what's in `content/` decides.
function Home() {
  if (all.length === 1) {
    return <Article article={all[0]} all={all} />
  }
  return <SeriesIndex articles={all} />
}

function ArticleRoute() {
  const { slug } = useParams()
  const article = all.find((a) => a.slug === slug)
  if (!article) return <Navigate to="/" replace />
  return <Article article={article} all={all} />
}
