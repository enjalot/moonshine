import { useEffect, useRef } from 'react'
import { figures } from '../figures/registry'
import { useArticleStore, useFigureHighlight } from '../store'
import LazyIsland from './LazyIsland'

type Props = {
  id?: string
  caption?: string
  children?: React.ReactNode
}

export default function Figure({ id, caption, children }: Props) {
  const { hovered, pinned } = useFigureHighlight(id)
  // Depend on the raw pinned ref, not the boolean: pinning a different
  // part of the same figure should re-scroll, and a boolean wouldn't
  // change between `fig.a` and `fig.b`.
  const pinnedRef = useArticleStore((s) => s.pinnedTermRef)
  const ref = useRef<HTMLElement>(null)
  const Component = id ? figures[id] : null

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

  if (!Component) {
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

  const stateClass = pinned
    ? 'figure-pinned'
    : hovered
      ? 'figure-hovered'
      : ''

  return (
    <figure ref={ref} id={id} className={`figure ${stateClass}`.trim()}>
      <LazyIsland>
        <Component />
      </LazyIsland>
      {(caption || children) && (
        <figcaption className="figure-caption">
          {caption ?? children}
        </figcaption>
      )}
    </figure>
  )
}
