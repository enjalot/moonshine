import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// KaTeX styles for math rendered by rehype-katex ($...$ and $$...$$ in
// markdown). Bundled from npm so articles work offline — no CDN request.
import 'katex/dist/katex.min.css'
import './styles/tokens.css'
import './styles/article.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
