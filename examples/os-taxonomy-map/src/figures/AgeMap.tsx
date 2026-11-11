import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { FigureProps, ParamHint } from './registry'
import { useFigureHighlight } from '../store'
import { num } from './lib/params'
import {
  drawHaloText,
  esc,
  makeCanvas,
  MIN_LABEL_PX,
  px,
  py,
  reducedMotion,
  SUBJECT_COLOR,
  SUBJECTS,
  themeColors,
  useTaxonomy,
  type View,
} from './lib/taxonomy'

// Figure 2: the map fills in by starting age. Three states per topic:
// opening at the selected age (bright, with a ring as it arrives), opened
// at an earlier age (its subject color, faded), and not yet open (gray).
// The bars count topics opening at each age.
//
// The figure opens on age 5 because that is the year the article's claim
// is visible without touching anything: 256 topics in all eight subjects,
// reaching every part of the map. `:term[..]{to=age-map.age-6}` in the
// prose previews an age while the term is hovered and moves the figure
// there when it is clicked.

export const DEFAULTS = {
  // The age the figure shows before the reader touches it.
  age: 5,
}

export const PARAM_HINTS: Record<string, ParamHint> = {
  age: { min: 4, max: 13, step: 1 },
}

const MIN_AGE = 4
const MAX_AGE = 13
const partAge = (part: string | null | undefined): number | null => {
  const m = typeof part === 'string' ? /^age-(\d+)$/.exec(part) : null
  if (!m) return null
  const a = +m[1]
  return a >= MIN_AGE && a <= MAX_AGE ? a : null
}

export default function AgeMap({ figureId, ...props }: FigureProps) {
  const data = useTaxonomy()
  const startAge = Math.round(Math.max(MIN_AGE, Math.min(MAX_AGE, num(props.age, DEFAULTS.age))))
  const { hoveredPart, pinnedPart } = useFigureHighlight(figureId)
  const termRef = useRef<((hover: number | null, pin: number | null) => void) | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const barsRef = useRef<SVGSVGElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  const hoverAge = partAge(hoveredPart)
  const pinAge = partAge(pinnedPart)
  useEffect(() => {
    const wrap = wrapRef.current
    const slider = sliderRef.current
    const playBtn = playRef.current
    const readout = readoutRef.current
    const barsSvg = barsRef.current
    const tipEl = tipRef.current
    if (!data || !wrap || !slider || !playBtn || !readout || !barsSvg || !tipEl) return
    const { pts, prereqsOf } = data
    // Short enough on a desktop that the map and its bars fit one screen.
    const cv = makeCanvas(wrap, (w) => (w < 480 ? 0.9 : 0.62))
    const view: View = { cx: 0, cy: 0, k: 1 }

    const AGES = d3.range(MIN_AGE, MAX_AGE + 1)
    const counts = d3.rollup(pts, (v) => v.length, (p) => p.a0)
    const countAt = (a: number) => counts.get(a) || 0
    const openBy = (a: number) => d3.sum(AGES.filter((b) => b <= a), countAt)

    // `chosen` is the age the reader set (slider, bars, play, a clicked
    // term). `shown` is what is drawn, which a hovered term can borrow.
    let chosen = startAge
    let age = startAge
    let playing = false
    let hovered: number | null = null
    let playTimer: ReturnType<typeof setInterval> | null = null
    let flashTimer: d3.Timer | null = null
    const tip = d3.select(tipEl)

    function describe() {
      const bySubject = d3.rollup(pts.filter((p) => p.a0 === age), (v) => v.length, (p) => p.subject)
      const parts = SUBJECTS.filter((s) => bySubject.get(s)).map((s) => `${bySubject.get(s)} ${s}`)
      cv.canvas.setAttribute(
        'aria-label',
        `Map of the 1,590 topics at age ${age}. ${countAt(age)} topics open at this age (${parts.join(', ')}), ` +
          `${openBy(age - 1)} opened earlier and ${pts.length - openBy(age)} are still to come.`,
      )
    }

    function render(flashT = 1) {
      const { ctx, w, h } = cv
      const theme = themeColors(wrap!)
      ctx.clearRect(0, 0, w, h)
      const r = Math.max(2, Math.min(w, h) / 260)
      const quietR = Math.max(1.2, r - 0.8)
      const activeR = r + 1

      // Prerequisites feeding the cohort that opens at this age. Drawn
      // under every dot so they give structure without competing.
      ctx.beginPath()
      for (const p of pts) {
        if (p.a0 !== age) continue
        for (const edge of prereqsOf[p.i]) {
          const q = pts[edge.p]
          ctx.moveTo(px(p.x, view, w, h), py(p.y, view, w, h))
          ctx.lineTo(px(q.x, view, w, h), py(q.y, view, w, h))
        }
      }
      ctx.strokeStyle = theme.text2
      ctx.globalAlpha = 0.14
      ctx.lineWidth = 0.65
      ctx.stroke()

      if (hovered != null && pts[hovered].a0 === age) {
        const p = pts[hovered]
        ctx.beginPath()
        for (const edge of prereqsOf[p.i]) {
          const q = pts[edge.p]
          ctx.moveTo(px(p.x, view, w, h), py(p.y, view, w, h))
          ctx.lineTo(px(q.x, view, w, h), py(q.y, view, w, h))
        }
        ctx.strokeStyle = theme.text
        ctx.globalAlpha = 0.6
        ctx.lineWidth = 1.2
        ctx.stroke()
      }

      // Not yet open: gray. Opened earlier: subject color, faded. The
      // faded layer is what makes "filling in" visible from year to year.
      for (const p of pts) {
        if (p.a0 <= age) continue
        ctx.beginPath()
        ctx.arc(px(p.x, view, w, h), py(p.y, view, w, h), quietR, 0, 6.2832)
        ctx.fillStyle = theme.text2
        ctx.globalAlpha = 0.26
        ctx.fill()
      }
      for (const p of pts) {
        if (p.a0 >= age) continue
        ctx.beginPath()
        ctx.arc(px(p.x, view, w, h), py(p.y, view, w, h), r, 0, 6.2832)
        ctx.fillStyle = SUBJECT_COLOR[p.subject]
        ctx.globalAlpha = 0.55
        ctx.fill()
      }

      for (const p of pts) {
        if (p.a0 !== age) continue
        const x = px(p.x, view, w, h), y = py(p.y, view, w, h)
        ctx.beginPath()
        ctx.arc(x, y, activeR * (0.5 + 0.5 * flashT), 0, 6.2832)
        ctx.fillStyle = SUBJECT_COLOR[p.subject]
        ctx.globalAlpha = 1
        ctx.fill()
        if (flashT < 1) {
          ctx.beginPath()
          ctx.arc(x, y, activeR + 7 * flashT, 0, 6.2832)
          ctx.strokeStyle = SUBJECT_COLOR[p.subject]
          ctx.globalAlpha = 0.7 * (1 - flashT)
          ctx.lineWidth = 1.4
          ctx.stroke()
        }
      }

      if (hovered != null && pts[hovered].a0 === age) {
        const p = pts[hovered]
        for (const edge of prereqsOf[p.i]) {
          const q = pts[edge.p]
          ctx.beginPath()
          ctx.arc(px(q.x, view, w, h), py(q.y, view, w, h), r + 3, 0, 6.2832)
          ctx.strokeStyle = theme.text
          ctx.globalAlpha = 0.8
          ctx.lineWidth = 1.25
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(px(p.x, view, w, h), py(p.y, view, w, h), activeR + 3, 0, 6.2832)
        ctx.strokeStyle = theme.text
        ctx.globalAlpha = 1
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      drawHaloText(ctx, `age ${age}`, 12, 20, { size: 20, weight: 700, align: 'left', color: theme.text, halo: theme.halo })
    }

    function show(a: number, animate = true) {
      const next = Math.max(MIN_AGE, Math.min(MAX_AGE, a))
      const changed = next !== age
      age = next
      slider!.value = String(age)
      slider!.setAttribute('aria-valuetext', `age ${age}, ${countAt(age)} topics open`)
      readout!.textContent = `${countAt(age)} topics open at age ${age}, ${openBy(age - 1)} opened earlier`
      hovered = null
      tip.style('opacity', '0')
      describe()
      renderBars()
      if (flashTimer) flashTimer.stop()
      if (animate && changed && !reducedMotion) {
        flashTimer = d3.timer((el) => {
          const t = Math.min(1, el / 700)
          render(t)
          if (t >= 1) flashTimer!.stop()
        })
      } else {
        render(1)
      }
    }

    function setAge(a: number, animate = true) {
      chosen = Math.max(MIN_AGE, Math.min(MAX_AGE, a))
      show(chosen, animate)
    }

    function stopPlay() {
      playing = false
      playBtn!.textContent = 'Play'
      if (playTimer) clearInterval(playTimer)
    }

    // Term links from the prose. Hovering one borrows the view and gives
    // it back on leave; clicking one moves the figure there for good.
    let lastPin: number | null = null
    termRef.current = (hover, pin) => {
      if (pin !== lastPin) {
        lastPin = pin
        if (pin != null) {
          stopPlay()
          chosen = pin
        }
      }
      const target = hover ?? chosen
      if (hover != null) stopPlay()
      if (target !== age) show(target)
    }

    const bars = d3.select(barsSvg)
    function renderBars() {
      const w = barsSvg!.clientWidth, h = 96
      const base = h - 22
      const x = d3.scaleBand<number>().domain(AGES).range([2, w - 2]).padding(0.16)
      const y = d3.scaleLinear().domain([0, d3.max(AGES, countAt)!]).range([base, 20])
      bars
        .selectAll<SVGRectElement, number>('rect.bar')
        .data(AGES)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', (a) => x(a)!)
        .attr('width', x.bandwidth())
        .attr('y', (a) => y(countAt(a)))
        .attr('height', (a) => base - y(countAt(a)))
        .attr('rx', 2)
        .attr('fill', (a) => (a === age ? 'var(--accent)' : 'var(--text-2)'))
        .attr('opacity', (a) => (a === age ? 1 : a < age ? 0.45 : 0.2))
      // Full-height hit areas, so the short bars are as easy to tap as
      // the tall ones.
      bars
        .selectAll<SVGRectElement, number>('rect.hit')
        .data(AGES)
        .join('rect')
        .attr('class', 'hit')
        .attr('x', (a) => x(a)! - x.step() * 0.08)
        .attr('width', x.step())
        .attr('y', 0)
        .attr('height', h)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('click', (_ev, a) => {
          stopPlay()
          setAge(a)
        })
      bars
        .selectAll<SVGTextElement, number>('text.lbl')
        .data(AGES)
        .join('text')
        .attr('class', 'lbl')
        .attr('x', (a) => x(a)! + x.bandwidth() / 2)
        .attr('y', h - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', MIN_LABEL_PX)
        .attr('font-weight', (a) => (a === age ? 700 : 400))
        .attr('fill', (a) => (a === age ? 'var(--text)' : 'var(--text-2)'))
        .attr('pointer-events', 'none')
        .text((a) => a)
      bars
        .selectAll<SVGTextElement, number>('text.cnt')
        .data([age])
        .join('text')
        .attr('class', 'cnt')
        .attr('x', x(age)! + x.bandwidth() / 2)
        .attr('y', y(countAt(age)) - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', MIN_LABEL_PX)
        .attr('font-weight', 600)
        .attr('fill', 'var(--text)')
        .attr('pointer-events', 'none')
        .text(countAt(age))
    }

    const onSlider = () => {
      stopPlay()
      setAge(+slider.value)
    }
    const onPlay = () => {
      if (playing) {
        stopPlay()
        return
      }
      playing = true
      playBtn.textContent = 'Pause'
      // Play always tells the whole story, from the two seeds at age 4.
      setAge(MIN_AGE)
      playTimer = setInterval(() => {
        if (chosen >= MAX_AGE) {
          stopPlay()
          return
        }
        setAge(chosen + 1)
      }, reducedMotion ? 1200 : 1500)
    }
    slider.addEventListener('input', onSlider)
    playBtn.addEventListener('click', onPlay)

    function findActiveAt(ev: PointerEvent): number | null {
      const [mx, my] = d3.pointer(ev, cv.canvas)
      const hitRadius = Math.max(12, Math.min(cv.w, cv.h) / 90)
      let best: number | null = null
      let bestD2 = hitRadius * hitRadius
      for (const p of pts) {
        if (p.a0 !== age) continue
        const dx = px(p.x, view, cv.w, cv.h) - mx
        const dy = py(p.y, view, cv.w, cv.h) - my
        const d2 = dx * dx + dy * dy
        if (d2 < bestD2) {
          best = p.i
          bestD2 = d2
        }
      }
      return best
    }

    const canvas = d3.select(cv.canvas)
    canvas
      .on('pointermove pointerdown', (ev: PointerEvent) => {
        const i = findActiveAt(ev)
        if (i !== hovered) {
          hovered = i
          render(1)
        }
        if (i == null) {
          tip.style('opacity', '0')
          cv.canvas.style.cursor = 'default'
          return
        }
        const p = pts[i]
        const pre = prereqsOf[p.i]
        tip
          .html(
            `<div class="tip-name">${esc(p.name)}</div>
             <div class="tip-sub">${esc(p.subject)} · ages ${p.a0}–${p.a1}</div>
             <div class="tip-desc">${
               pre.length
                 ? 'Builds on ' + pre.map((e) => esc(pts[e.p].name)).join(', ')
                 : 'No prerequisites'
             }</div>`,
          )
          .style('opacity', '1')
        const tw = tipEl.offsetWidth, th = tipEl.offsetHeight
        tip
          .style('left', Math.max(8, Math.min(ev.clientX + 14, window.innerWidth - tw - 8)) + 'px')
          .style('top', Math.max(Math.min(ev.clientY + 18, window.innerHeight - th - 8), 8) + 'px')
        cv.canvas.style.cursor = 'pointer'
      })
      .on('pointerleave', () => {
        hovered = null
        tip.style('opacity', '0')
        cv.canvas.style.cursor = 'default'
        render(1)
      })

    const ro = new ResizeObserver(() => {
      if (cv.resize()) {
        render(1)
        renderBars()
      }
    })
    ro.observe(wrap)
    show(startAge, false)

    return () => {
      termRef.current = null
      slider.removeEventListener('input', onSlider)
      playBtn.removeEventListener('click', onPlay)
      ro.disconnect()
      if (playTimer) clearInterval(playTimer)
      if (flashTimer) flashTimer.stop()
      bars.selectAll('*').remove()
      canvas.on('pointermove pointerdown', null).on('pointerleave', null)
      wrap.removeChild(cv.canvas)
    }
  }, [data, startAge])

  // Declared after the effect above so the handler exists when this runs.
  useEffect(() => {
    termRef.current?.(hoverAge, pinAge)
  }, [hoverAge, pinAge, data])

  return (
    <div className="age-map">
      <div className="controls">
        <button ref={playRef} type="button">
          Play
        </button>
        <label>
          age{' '}
          <input ref={sliderRef} type="range" min={MIN_AGE} max={MAX_AGE} step={1} defaultValue={startAge} />
        </label>
        <span ref={readoutRef} className="age-readout" aria-live="polite" />
      </div>
      <div ref={wrapRef} className="age-canvas-wrap" />
      <svg ref={barsRef} className="age-bars" aria-hidden="true" />
      <p className="figure-hint">
        Drag the slider, tap a bar, or press Play to run from age 4. Point at a bright topic to see what it builds on.
      </p>
      <div ref={tipRef} className="tip" />
    </div>
  )
}
