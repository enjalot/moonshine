import { useEffect, useRef } from 'react'
import { figures } from '../figures/registry'
import { useArticleStore, useFigureHighlight } from '../store'
import LazyIsland from './LazyIsland'

type Props = {
  id?: string
  caption?: string
  children?: React.ReactNode
  // react-markdown's hast node — plumbing, not a prop figures receive.
  node?: unknown
  // Everything else came from the directive's attributes and passes
  // through to the figure component as props (as strings).
  [key: string]: unknown
}

export default function Figure({ id, caption, children, node: _node, ...rest }: Props) {
  const { hovered, pinned } = useFigureHighlight(id)
  // Depend on the raw pinned ref, not the boolean: pinning a different
  // part of the same figure should re-scroll, and a boolean wouldn't
  // change between `fig.a` and `fig.b`.
  const pinnedRef = useArticleStore((s) => s.pinnedTermRef)
  const ref = useRef<HTMLElement>(null)
  const entry = id ? figures[id] : null

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
    pinned ? 'figure-pinned' : hovered ? 'figure-hovered' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <figure ref={ref} id={id} className={cls}>
      <LazyIsland height={entry.height}>
        <Component figureId={id} {...rest} />
      </LazyIsland>
      {(caption || children) && (
        <figcaption className="figure-caption">
          {caption ?? children}
        </figcaption>
      )}
    </figure>
  )
}
