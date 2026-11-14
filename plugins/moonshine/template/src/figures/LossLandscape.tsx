import { useCallback, useEffect, useId, useState } from 'react'
import { inOrder, param, translate, type Draggable } from 'dragology'
import type { FigureProps } from './registry'
import DragFigure from './drag/DragFigure'
import { each } from './drag/each'
import { loss, grad } from './lib/lossSurface'
import { num } from './lib/params'

// A heatmap of a synthetic two-well loss surface, with a starting point
// that traces the path gradient descent takes downhill.
//
// Built with declarative dragging (drag/DragFigure.tsx). Both drags are
// the same one-liner, d.vary over the start's x and y: "dragging this
// may change the start point". On the start point, that just moves it.
// On a dot partway along the path, Dragology searches for the start
// whose path puts *that dot* under the pointer, so a reader can grab
// the path anywhere and bend it, and watch the start go where it must.

// Tweakable surface. Override per-instance from markdown:
//   :::figure{id=loss-landscape lr=0.15 startX=-0.2}
export const DEFAULTS = {
  lr: 0.08, // gradient-descent step size (η)
  steps: 80, // max iterations before the path gives up
  startX: 0.7, // initial point, surface coords in [-1, 1]
  startY: 0.45,
}

// Knob-panel slider bounds where the magnitude heuristic guesses wrong:
// the start point lives in [-1, 1] (the heuristic would offer [0, 5]),
// and lr past ~0.5 just diverges.
export const PARAM_HINTS = {
  lr: { min: 0.005, max: 0.5, step: 0.005 },
  startX: { min: -1, max: 1, step: 0.05 },
  startY: { min: -1, max: 1, step: 0.05 },
}

const W = 480
const H = 320
const sx = (x: number) => ((x + 1) / 2) * W
const sy = (y: number) => ((y + 1) / 2) * H
// Every DOT_EVERY-th iterate gets a grabbable dot.
const DOT_EVERY = 6

type State = { x: number; y: number }

export default function LossLandscape(props: FigureProps) {
  const lr = num(props.lr, DEFAULTS.lr)
  const steps = num(props.steps, DEFAULTS.steps)
  const startX = num(props.startX, DEFAULTS.startX)
  const startY = num(props.startY, DEFAULTS.startY)
  const [state, setState] = useState<State>({ x: startX, y: startY })
  // Dragology ids end up in the DOM, so scope them to this instance.
  const uid = useId().replace(/:/g, '')
  // Follow live param changes (knob panel, markdown edit); the reader's
  // own drags win until the params change again.
  useEffect(() => setState({ x: startX, y: startY }), [startX, startY])

  const draw = useCallback<Draggable<State>>(
    ({ state, d, setState, isTracking }) => {
      const path = descend([state.x, state.y], lr, steps)
      const pull = () =>
        d.vary(state, [param('x'), param('y')], {
          constraint: (s) => [...inOrder([-1, s.x, 1]), ...inOrder([-1, s.y, 1])],
        })
      return (
        <g>
          {/* Clicking the surface moves the start there (animated). The
              heatmap is one image, and skipped while Dragology is only
              tracking where the dragged dot lands. */}
          {!isTracking && (
            <image
              href={heatmap()}
              width={W}
              height={H}
              preserveAspectRatio="none"
              style={{ cursor: 'crosshair' }}
              onClick={(e) => {
                const ctm = (e.currentTarget as SVGGraphicsElement).getScreenCTM()
                if (!ctm) return
                const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
                setState({ x: (p.x / W) * 2 - 1, y: (p.y / H) * 2 - 1 })
              }}
            />
          )}
          <path
            d={path.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
          {each(path, ([x, y], i) =>
            i > 0 && i % DOT_EVERY === 0 ? (
              <circle
                id={`${uid}-step-${i}`}
                transform={translate(sx(x), sy(y))}
                r={4}
                fill="var(--fig-bg)"
                stroke="var(--accent)"
                strokeWidth={2}
                style={{ cursor: 'grab' }}
                dragologyOnDrag={pull}
              />
            ) : null,
          )}
          <circle
            id={`${uid}-start`}
            transform={translate(sx(state.x), sy(state.y))}
            r={7}
            fill="var(--accent)"
            stroke="var(--fig-bg)"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            dragologyOnDrag={pull}
          />
        </g>
      )
    },
    [lr, steps, uid],
  )

  return (
    <>
      <DragFigure
        draggable={draw}
        width={W}
        height={H}
        state={state}
        onState={setState}
        label="Heatmap of a loss surface with two valleys. A movable starting point traces the path gradient descent takes downhill."
        style={{ borderRadius: 4, overflow: 'hidden' }}
      />
      <p className="figure-hint">drag the start, or grab a dot on the path and pull it · click to jump</p>
    </>
  )
}

function descend(initial: [number, number], lr: number, steps: number): [number, number][] {
  let [x, y] = initial
  const path: [number, number][] = [[x, y]]
  for (let i = 0; i < steps; i++) {
    const [gx, gy] = grad(x, y)
    x -= lr * gx
    y -= lr * gy
    path.push([x, y])
    if (Math.hypot(gx, gy) < 0.005) break
  }
  return path
}

// The surface as one image, drawn once: dark = low loss (valleys),
// light = high loss (peaks).
let heat: string | null = null
function heatmap(): string {
  if (heat) return heat
  const cw = 120
  const ch = 80
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      ctx.fillStyle = lossColor(loss(((i + 0.5) / cw) * 2 - 1, ((j + 0.5) / ch) * 2 - 1))
      ctx.fillRect(i, j, 1, 1)
    }
  }
  heat = canvas.toDataURL()
  return heat
}

// Map loss value (roughly [-0.4, 1]) to a gray scale.
function lossColor(v: number) {
  const t = Math.max(0, Math.min(1, (v + 0.4) / 1.4))
  return `hsl(220, 14%, ${22 + t * 68}%)`
}
