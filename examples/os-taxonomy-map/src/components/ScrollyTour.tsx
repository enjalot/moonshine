import { Children, isValidElement, useEffect, useRef, type ReactNode } from 'react'
import * as d3 from 'd3'
import {
  drawHaloText,
  makeCanvas,
  px,
  py,
  reducedMotion,
  SUBJECT_COLOR,
  themeColors,
  useTaxonomy,
  GRAY,
  type Pt,
  type View,
} from '../figures/lib/taxonomy'

// Figure 1 — the scrollytelling tour.
//
// This is a container directive (`::::scrolly-tour`), NOT a registry
// figure. The prose lives in the nested `:::step` cards (authored in
// markdown, so each is editable in place exactly like a figure caption);
// the camera choreography lives here in code, keyed by step index. The two
// stay independent: reword a card without touching the animation, retune a
// view without touching the prose.

const CONTINENTS = [
  { label: 'Science', x: -0.33, y: 0.66 },
  { label: 'Mathematics', x: -0.86, y: -0.42 },
  { label: 'English', x: 0.16, y: -0.72 },
  { label: 'History', x: 0.93, y: -0.14 },
]

type StepSpec = {
  view: View
  mode: 'mono' | 'subject' | 'age'
  continents?: boolean
  agescale?: boolean
  journey?: { from: string; to: string[] }
  labels?: { name: string; dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }[]
  clusterLabels?: string[]
  caption: string
}

// One entry per story card, in order. If the author adds cards beyond
// these, the last spec is reused (the map just holds its final view).
const STEPS: StepSpec[] = [
  {
    view: { cx: 0, cy: 0, k: 1 },
    mode: 'mono',
    caption: 'Every dot is one micro-topic, positioned by the meaning of its description.',
  },
  {
    view: { cx: 0, cy: 0, k: 1 },
    mode: 'subject',
    continents: true,
    caption: 'Dots colored by subject. The layout never saw these labels.',
  },
  {
    view: { cx: 0.9, cy: -0.28, k: 5.4 },
    mode: 'subject',
    labels: [
      { name: 'Pyramids and the Great Sphinx', dx: -16, dy: -2, anchor: 'end' },
      { name: 'Egyptian Maths and Engineering', dx: 16, dy: 14, anchor: 'start' },
      { name: 'Pompeii & Vesuvius', dx: 0, dy: 20, anchor: 'middle' },
    ],
    clusterLabels: ['Ancient Egypt Overview', 'Ancient Greece and Rome'],
    caption:
      'The east coast: Ancient Egypt beside Greece and Rome. The green dot is Science living among History.',
  },
  {
    view: { cx: -0.45, cy: 0.922, k: 11 },
    mode: 'subject',
    journey: {
      from: 'Pompeii & Vesuvius',
      to: ['Power of Eruptions', 'What Is a Volcano', 'Inside a Volcano'],
    },
    labels: [
      { name: 'Power of Eruptions', dx: -16, dy: 20, anchor: 'end' },
      { name: 'What Is a Volcano', dx: -18, dy: -16, anchor: 'end' },
      { name: 'Inside a Volcano', dx: 18, dy: -2, anchor: 'start' },
    ],
    caption: 'Pompeii connects across the map to three volcano prerequisites in Science.',
  },
  {
    view: { cx: -0.435, cy: -0.505, k: 11 },
    mode: 'subject',
    labels: [
      { name: 'Coins & Notes', dx: -16, dy: -18, anchor: 'end' },
      { name: 'Coin Values', dx: 16, dy: 22, anchor: 'start' },
      { name: 'Estimating and comparing money', dx: 20, dy: -10, anchor: 'start' },
    ],
    caption: 'A border town: money topics from Life Skills and Mathematics share the same block.',
  },
  {
    view: { cx: 0, cy: 0, k: 1 },
    mode: 'age',
    agescale: true,
    caption:
      'Dots colored by starting age, dark (4) to bright (12+). Each continent has its own gradient.',
  },
]

export default function ScrollyTour({ children }: { children?: ReactNode }) {
  const data = useTaxonomy()
  const wrapRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLSpanElement>(null)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  const cards = Children.toArray(children).filter(isValidElement)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!data || !wrap) return
    const { pts, clusters, byName } = data
    const cv = makeCanvas(wrap, 0.92)
    const ageColor = d3.scaleSequential(d3.interpolateViridis).domain([4, 13])

    const colorFor = (p: Pt, mode: StepSpec['mode']) =>
      mode === 'mono' ? GRAY : mode === 'subject' ? SUBJECT_COLOR[p.subject] : ageColor(p.a0)

    const specAt = (step: number) => STEPS[Math.min(step, STEPS.length - 1)]

    let cur = {
      view: { cx: 0, cy: 0, k: 1 } as View,
      mode: 'mono' as StepSpec['mode'],
      step: 0,
    }
    let timer: d3.Timer | null = null

    function drawAgeLegend(ctx: CanvasRenderingContext2D, w: number, theme: ReturnType<typeof themeColors>) {
      const lw = 130, lh = 8, x0 = w - lw - 40, y0 = 18
      for (let i = 0; i < lw; i++) {
        ctx.fillStyle = ageColor(4 + (i / lw) * 9)
        ctx.fillRect(x0 + i, y0, 1.5, lh)
      }
      drawHaloText(ctx, 'age 4', x0 - 6, y0 + lh / 2, { size: 10.5, align: 'right', color: theme.text, halo: theme.halo })
      drawHaloText(ctx, '13+', x0 + lw + 16, y0 + lh / 2, { size: 10.5, color: theme.text, halo: theme.halo })
    }

    function projectedPoint(p: Pt, view: View, w: number, h: number) {
      return { x: px(p.x, view, w, h), y: py(p.y, view, w, h) }
    }

    function render(view: View, colors: string[], alpha: number, step: number, journeyT = 1) {
      const { ctx, w, h } = cv
      const theme = themeColors(wrap!)
      ctx.clearRect(0, 0, w, h)
      const r = Math.max(2, Math.min(w, h) / 260) * Math.sqrt(Math.min(view.k, 4)) * 0.9
      const spec = specAt(step)

      // The Pompeii story is a cross-map prerequisite journey. Draw these
      // links below the dots so both endpoints remain legible as the camera
      // pulls out and crosses to the Science volcano cluster.
      if (spec.journey) {
        const from = byName.get(spec.journey.from)
        if (from) {
          const a = projectedPoint(from, view, w, h)
          ctx.beginPath()
          for (const name of spec.journey.to) {
            const target = byName.get(name)
            if (!target) continue
            const b = projectedPoint(target, view, w, h)
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(a.x + (b.x - a.x) * journeyT, a.y + (b.y - a.y) * journeyT)
          }
          ctx.strokeStyle = SUBJECT_COLOR.Science
          ctx.globalAlpha = 0.7
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const q = projectedPoint(p, view, w, h)
        const x = q.x, y = q.y
        if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 6.2832)
        ctx.fillStyle = colors[i]
        ctx.globalAlpha = 0.85
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (spec.continents && alpha > 0.5) {
        CONTINENTS.forEach((c) =>
          drawHaloText(ctx, c.label, px(c.x, view, w, h), py(c.y, view, w, h), {
            size: Math.min(w, h) / 26,
            weight: 700,
            color: theme.text,
            halo: theme.halo,
          }),
        )
      }
      if (alpha > 0.6) {
        ;(spec.clusterLabels || []).forEach((name) => {
          const c = clusters.find((cl) => cl.label === name)
          if (c)
            drawHaloText(ctx, c.label.replace(' Overview', ''), px(c.cx, view, w, h), py(c.cy, view, w, h) - 48, {
              size: 13,
              weight: 700,
              color: theme.text2,
              halo: theme.halo,
            })
        })
        ;(spec.labels || []).forEach((l) => {
          const p = byName.get(l.name)
          if (!p) return
          const q = projectedPoint(p, view, w, h)
          const x = q.x, y = q.y
          ctx.beginPath()
          ctx.arc(x, y, r + 2.5, 0, 6.2832)
          ctx.strokeStyle = theme.text
          ctx.lineWidth = 1.4
          ctx.stroke()
          if (Math.abs(l.dx) + Math.abs(l.dy) > 20) {
            ctx.beginPath()
            ctx.moveTo(x + Math.sign(l.dx) * (r + 3), y + Math.sign(l.dy) * (r + 3) * (l.dx === 0 ? 1 : 0.4))
            ctx.lineTo(x + l.dx * 0.8, y + l.dy * 0.8)
            ctx.strokeStyle = '#9a9aae'
            ctx.lineWidth = 1
            ctx.stroke()
          }
          drawHaloText(ctx, p.name, x + l.dx, y + l.dy, {
            size: 11.5,
            weight: 600,
            color: theme.text,
            halo: theme.halo,
            align: l.anchor === 'end' ? 'right' : l.anchor === 'start' ? 'left' : 'center',
          })
        })
      }
      if (spec.agescale && alpha > 0.5) drawAgeLegend(ctx, w, theme)
    }

    function goToStep(step: number) {
      const spec = specAt(step)
      if (captionRef.current) captionRef.current.textContent = spec.caption
      if (timer) timer.stop()
      const v0 = { ...cur.view }, v1 = spec.view
      const iz = d3.interpolateZoom([v0.cx, v0.cy, 2.3 / v0.k], [v1.cx, v1.cy, 2.3 / v1.k])
      const c0 = pts.map((p) => colorFor(p, cur.mode) as string)
      const c1 = pts.map((p) => colorFor(p, spec.mode) as string)
      const sameColors = cur.mode === spec.mode
      const ci = sameColors ? null : c0.map((c, i) => d3.interpolateRgb(c, c1[i]))
      const dur = reducedMotion ? 0 : Math.max(700, Math.min(1600, iz.duration))
      cur = { view: v1, mode: spec.mode, step }
      if (dur === 0) {
        render(v1, c1, 1, step, 1)
        return
      }

      if (spec.journey) {
        const overview: View = { cx: 0, cy: 0, k: 1 }
        const izOut = d3.interpolateZoom([v0.cx, v0.cy, 2.3 / v0.k], [overview.cx, overview.cy, 2.3])
        const izIn = d3.interpolateZoom([overview.cx, overview.cy, 2.3], [v1.cx, v1.cy, 2.3 / v1.k])
        const journeyDur = 2400
        timer = d3.timer((elapsed) => {
          const t = Math.min(1, elapsed / journeyDur)
          const e = d3.easeCubicInOut(t)
          const split = 0.48
          const z = e < split ? izOut(e / split) : izIn((e - split) / (1 - split))
          const view: View = { cx: z[0], cy: z[1], k: 2.3 / z[2] }
          const colors = sameColors ? c1 : ci!.map((f) => f(e))
          render(view, colors, t, step, Math.min(1, e / split))
          if (t >= 1) {
            timer!.stop()
            render(v1, c1, 1, step, 1)
          }
        })
        return
      }

      timer = d3.timer((elapsed) => {
        const t = Math.min(1, elapsed / dur)
        const e = d3.easeCubicInOut(t)
        const [cx, cy, vw] = iz(e)
        const view: View = { cx, cy, k: 2.3 / vw }
        const colors = sameColors ? c1 : ci!.map((f) => f(e))
        render(view, colors, t, step, 1)
        if (t >= 1) {
          timer!.stop()
          render(v1, c1, 1, step, 1)
        }
      })
    }

    const els = stepRefs.current.filter(Boolean) as HTMLDivElement[]
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            els.forEach((el) => el.classList.remove('active'))
            ;(e.target as HTMLElement).classList.add('active')
            goToStep(+(e.target as HTMLElement).dataset.step!)
          }
        })
      },
      { threshold: 0.5 },
    )
    els.forEach((el) => io.observe(el))

    const ro = new ResizeObserver(() => {
      if (cv.resize())
        render(
          cur.view,
          pts.map((p) => colorFor(p, cur.mode) as string),
          1,
          cur.step,
          1,
        )
    })
    ro.observe(wrap)
    render(cur.view, pts.map((p) => colorFor(p, 'mono') as string), 1, 0, 1)

    return () => {
      io.disconnect()
      ro.disconnect()
      if (timer) timer.stop()
      wrap.removeChild(cv.canvas)
    }
  }, [data])

  return (
    <div className="scrolly-tour">
      <div className="tour">
        <div className="tour-figure">
          <div className="figure">
            <div ref={wrapRef} className="tour-canvas-wrap" style={{ position: 'relative' }} />
            <div className="figure-caption">
              <span className="figure-label">Figure 1.</span>{' '}
              <span ref={captionRef}>
                Every dot is one micro-topic, positioned by the meaning of its description.
              </span>
            </div>
          </div>
        </div>
        <div className="tour-steps">
          {cards.map((child, i) => (
            <div
              key={i}
              className="tour-step"
              data-step={i}
              ref={(el) => {
                stepRefs.current[i] = el
              }}
            >
              {child}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
