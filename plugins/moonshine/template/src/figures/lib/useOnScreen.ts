import { useEffect, useState, type RefObject } from 'react'

// True while the element is in the viewport and the tab is visible.
// LazyIsland mounts a figure once and never unmounts it, so anything
// that runs (a requestAnimationFrame loop, a simulation, a WebGL draw)
// should stop when this is false:
//
//   const ref = useRef<HTMLDivElement>(null)
//   const onScreen = useOnScreen(ref)
//   useEffect(() => {
//     if (!onScreen || reducedMotion()) return
//     let raf = requestAnimationFrame(function tick() { step(); raf = requestAnimationFrame(tick) })
//     return () => cancelAnimationFrame(raf)
//   }, [onScreen])

export function useOnScreen(ref: RefObject<Element | null>, rootMargin = '100px'): boolean {
  const [inView, setInView] = useState(false)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin })
    io.observe(el)
    const onVis = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ref, rootMargin])
  return inView && tabVisible
}

// prefers-reduced-motion reaches CSS transitions through tokens.css, but
// not a JavaScript animation loop. Check it before starting one, and show
// a still with a Play button instead.
export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
