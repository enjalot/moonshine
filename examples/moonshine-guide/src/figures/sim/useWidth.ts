import { useEffect, useRef, useState, type RefObject } from 'react'

// The width of an element, in CSS pixels, as it changes.
//
// DragFigure scales a drawing to its column, which shrinks the text along
// with everything else: a 560px drawing on a 300px phone column renders
// 16px labels at 8px. The sims measure the column instead and draw at that
// width (so DragFigure's scale is 1) and lay their contents out again.
export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
