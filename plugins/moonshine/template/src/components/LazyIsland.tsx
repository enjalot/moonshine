import { useEffect, useRef, useState } from 'react'

type Props = {
  children: React.ReactNode
  rootMargin?: string
  height?: number | string
}

// Astro-islands pattern, locally implemented. A figure only mounts when
// the wrapper scrolls within `rootMargin` of the viewport. This keeps
// heavy three.js / WebGL / large-data figures dormant until the reader
// actually reaches them.
//
// Once visible, the island stays mounted — re-mounting on scroll-out
// would lose interaction state and trip animations.
export default function LazyIsland({
  children,
  rootMargin = '200px',
  height = 'auto',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible || !ref.current) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin },
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [visible, rootMargin])

  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : height }}>
      {visible && children}
    </div>
  )
}
