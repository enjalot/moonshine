import { useArticleStore } from '../store'

type Props = {
  to?: string
  children: React.ReactNode
}

// Inline term that links a word in prose to a figure on the same page.
// Hover (or focus) softly highlights the figure; click pins the highlight
// and scrolls the figure into view. Click again to unpin.
export default function Term({ to, children }: Props) {
  const setHovered = useArticleStore((s) => s.setHovered)
  const togglePinned = useArticleStore((s) => s.togglePinned)
  const hovered = useArticleStore((s) => s.hoveredTermRef === to)
  const pinned = useArticleStore((s) => s.pinnedTermRef === to)

  // No target — render as plain styled text so authors can still use the
  // directive for vocabulary calls-out that don't need to link anywhere.
  if (!to) {
    return <span className="term term-static">{children}</span>
  }

  const cls = ['term', pinned && 'term-pinned', hovered && 'term-hovered']
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={cls}
      onPointerEnter={() => setHovered(to)}
      onPointerLeave={() => setHovered(null)}
      onFocus={() => setHovered(to)}
      onBlur={() => setHovered(null)}
      onClick={() => togglePinned(to)}
      aria-pressed={pinned}
    >
      {children}
    </button>
  )
}
