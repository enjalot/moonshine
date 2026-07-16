// FLIP-style vertical settling shared by the article's real reorder path
// and the local reorder simulation. Callers measure the old and new tops;
// this helper applies the inverse offset, then lets CSS transition it to 0.
export type ReorderElements = Map<string, HTMLElement>

export function animateVerticalReorder(
  elements: ReorderElements,
  previousTops: Map<string, number>,
): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => undefined
  }

  const moving: HTMLElement[] = []
  for (const [key, el] of elements) {
    const previousTop = previousTops.get(key)
    if (previousTop === undefined) continue
    const delta = previousTop - el.getBoundingClientRect().top
    if (Math.abs(delta) < 1) continue
    el.style.setProperty('--mn-reorder-delta-y', `${delta}px`)
    el.classList.add('mn-reorder-from')
    moving.push(el)
  }

  if (moving.length === 0) return () => undefined

  // Commit the inverse positions before asking the browser to transition
  // to the elements' new positions on the next frame.
  void moving[0].offsetHeight
  const frame = requestAnimationFrame(() => {
    for (const el of moving) {
      el.classList.add('mn-reorder-settling')
      el.classList.remove('mn-reorder-from')
    }
  })

  const clear = () => {
    for (const el of moving) {
      el.classList.remove('mn-reorder-from', 'mn-reorder-settling')
      el.style.removeProperty('--mn-reorder-delta-y')
    }
  }
  const timer = window.setTimeout(clear, 300)

  return () => {
    cancelAnimationFrame(frame)
    window.clearTimeout(timer)
    clear()
  }
}
