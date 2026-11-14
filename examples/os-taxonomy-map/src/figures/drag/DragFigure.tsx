import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { scale, translate, type Draggable } from 'dragology'
import DraggableRenderer from './Renderer'

// Declarative dragging (Dragology, https://declarative-dragging.github.io)
// for figures. A figure is a pure function from state to SVG; an element
// becomes draggable by saying which states dragging it can lead to:
//
//   dragologyOnDrag={() => d.between([{ on: false }, { on: true }])}
//
// and the library works out the motion, snapping and drop animation by
// rendering those states. See drag/README.md for the idioms.
//
// DragFigure is the frame around one: the figure draws in its own
// coordinate space (`width` × `height`, like an SVG viewBox) and is scaled
// to the column. Dragology measures the pointer in screen pixels and has
// no viewBox, so the scale is a transform on the root group, which its
// position tracking follows.
//
// Scaling the drawing would scale its text too, to 7px on a phone. Text
// that uses font-size: var(--mn-fig-text) is counter-scaled and renders
// at 13px at every width, so leave room for labels to grow relative to
// the drawing: place them with em offsets (dy="1.7em"), not pixels.

type Props<T extends object> = {
  draggable: Draggable<T>
  // The figure's coordinate space.
  width: number
  height: number
  // What screen readers hear: what the figure shows, not how to drag it.
  label: string
  // Never scale up past this (1 = drawn size at most).
  maxScale?: number
  className?: string
  style?: CSSProperties
  // HTML on top of the drawing (a readout, a reset button), positioned
  // against the figure's box.
  children?: ReactNode
} & (
  | { initialState: T; state?: undefined; onState?: (s: T) => void }
  | { state: T; initialState?: undefined; onState: (s: T) => void }
)

export default function DragFigure<T extends object>(props: Props<T>) {
  const { draggable, width, height, label, maxScale = 1, className, style, children } = props
  const ref = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const k = avail / width
  // The leading translate(0, 0) is load-bearing: a floating element gets
  // a translate prepended, and Dragology only blends transform lists of
  // the same shape (adjacent translates merge), so the root must start
  // with one too.
  const scaled = useMemo<Draggable<T>>(
    () => (p) => <g transform={translate(0, 0) + scale(k)}>{draggable(p)}</g>,
    [draggable, k],
  )
  const common = {
    draggable: scaled,
    width: Math.round(width * k),
    height: Math.round(height * k),
  }
  // The box keeps the figure's aspect ratio before it's measured, so the
  // page doesn't shift when the drawing arrives.
  return (
    <div
      ref={ref}
      className={`mn-drag-figure${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={label}
      // --mn-drag-k is the drawing's scale. Figure CSS divides by it so
      // text stays 13px on a phone while the drawing shrinks: use
      // font-size: var(--mn-fig-text) (article.css).
      style={{ position: 'relative', maxWidth: width * maxScale, aspectRatio: `${width} / ${height}`, margin: '0 auto', ['--mn-drag-k' as string]: k > 0 ? Math.min(1, k) : 1, ...style }}
    >
      {k > 0 &&
        (props.state !== undefined ? (
          <DraggableRenderer {...common} state={props.state} onDropState={props.onState} />
        ) : (
          <DraggableRenderer {...common} initialState={props.initialState as T} onDropState={props.onState} />
        ))}
      {children}
    </div>
  )
}
