import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { FigureProps } from './registry'
import {
  drawHaloText,
  makeCanvas,
  px,
  py,
  reducedMotion,
  SUBJECT_COLOR,
  themeColors,
  useTaxonomy,
  type View,
} from './lib/taxonomy'

// Figure 2 — the map fills in by starting age. Press play and each subject
// grows from its own seed; newly opened topics flash with a ring. The bar
// strip counts topics opening at each age (click a bar to jump).

export default function AgeMap(_props: FigureProps) {
  const data = useTaxonomy()
  const wrapRef = useRef<HTMLDivElement>(null)
  const barsRef = useRef<SVGSVGElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const slider = sliderRef.current
    const playBtn = playRef.current
    const readout = readoutRef.current
    const barsSvg = barsRef.current
    const tipEl = tipRef.current
    if (!data || !wrap || !slider || !playBtn || !readout || !barsSvg || !tipEl) return
    const { pts, prereqsOf } = data
    const cv = makeCanvas(wrap, 0.8)
    const view: View = { cx: 0, cy: 0, k: 1 }

    const counts = d3.rollup(pts, (v) => v.length, (p) => Math.min(p.a0, 13))
    const AGES = d3.range(4, 14)
    let age = +slider.value
    let playing = false
    let hovered: number | null = null
    let playTimer: ReturnType<typeof setInterval> | null = null
    let flashTimer: d3.Timer | null = null
    const tip = d3.select(tipEl)

    function render(flashT = 1) {
      const { ctx, w, h } = cv
      const theme = themeColors(wrap!)
      const quiet = getComputedStyle(wrap!).getPropertyValue('--border').trim() || '#c9c9d4'
      ctx.clearRect(0, 0, w, h)
      const r = Math.max(2, Math.min(w, h) / 260)
      const quietR = Math.max(1, r - 1)
      const activeR = r + 1

      // Prerequisites feeding the active cohort provide structure without
      // competing with the colored topics. Draw them before every dot.
      ctx.beginPath()
      for (const p of pts) {
        if (p.a0 !== age) continue
        for (const edge of prereqsOf[p.i]) {
          const prerequisite = pts[edge.p]
          ctx.moveTo(px(p.x, view, w, h), py(p.y, view, w, h))
          ctx.lineTo(px(prerequisite.x, view, w, h), py(prerequisite.y, view, w, h))
        }
      }
      ctx.strokeStyle = theme.text2
      ctx.globalAlpha = 0.12
      ctx.lineWidth = 0.65
      ctx.stroke()

      // Hovering one active topic strengthens only its own prerequisite
      // links. Endpoint rings keep the prerequisite topics legible within
      // the quiet gray field without recoloring them.
      if (hovered != null && pts[hovered].a0 === age) {
        const p = pts[hovered]
        ctx.beginPath()
        for (const edge of prereqsOf[p.i]) {
          const prerequisite = pts[edge.p]
          ctx.moveTo(px(p.x, view, w, h), py(p.y, view, w, h))
          ctx.lineTo(px(prerequisite.x, view, w, h), py(prerequisite.y, view, w, h))
        }
        ctx.strokeStyle = theme.text2
        ctx.globalAlpha = 0.48
        ctx.lineWidth = 1.15
        ctx.stroke()
      }

      // Every other age stays visible as quiet context. Draw the gray field
      // first so the selected cohort always sits above it.
      for (const p of pts) {
        if (p.a0 === age) continue
        const x = px(p.x, view, w, h), y = py(p.y, view, w, h)
        ctx.beginPath()
        ctx.arc(x, y, quietR, 0, 6.2832)
        ctx.fillStyle = quiet
        ctx.globalAlpha = 0.7
        ctx.fill()
      }

      for (const p of pts) {
        if (p.a0 !== age) continue
        const x = px(p.x, view, w, h), y = py(p.y, view, w, h)
        const rr = activeR * (0.4 + 0.6 * flashT) + activeR * 0.9 * (1 - flashT)
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, 6.2832)
        ctx.fillStyle = SUBJECT_COLOR[p.subject]
        ctx.globalAlpha = 0.95
        ctx.fill()
        if (flashT < 1) {
          ctx.beginPath()
          ctx.arc(x, y, activeR + 6 * flashT, 0, 6.2832)
          ctx.strokeStyle = SUBJECT_COLOR[p.subject]
          ctx.globalAlpha = 0.7 * (1 - flashT)
          ctx.lineWidth = 1.4
          ctx.stroke()
        }
      }

      if (hovered != null && pts[hovered].a0 === age) {
        const p = pts[hovered]
        for (const edge of prereqsOf[p.i]) {
          const prerequisite = pts[edge.p]
          ctx.beginPath()
          ctx.arc(px(prerequisite.x, view, w, h), py(prerequisite.y, view, w, h), quietR + 3, 0, 6.2832)
          ctx.strokeStyle = theme.text2
          ctx.globalAlpha = 0.75
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
      drawHaloText(ctx, `age ${age}`, 16, 24, { size: 20, weight: 700, align: 'left', color: theme.text, halo: theme.halo })
      readout!.textContent = `${counts.get(age) || 0} topics open at age ${age}`
    }

    function setAge(a: number, animate = true) {
      age = Math.max(4, Math.min(13, a))
      slider!.value = String(age)
      hovered = null
      tip.style('opacity', '0')
      renderBars()
      if (flashTimer) flashTimer.stop()
      if (animate && !reducedMotion) {
        flashTimer = d3.timer((el) => {
          const t = Math.min(1, el / 600)
          render(t)
          if (t >= 1) flashTimer!.stop()
        })
      } else {
        render(1)
      }
    }

    function stopPlay() {
      playing = false
      playBtn!.textContent = 'Play'
      if (playTimer) clearInterval(playTimer)
    }

    const bars = d3.select(barsSvg)
    function renderBars() {
      const w = barsSvg!.clientWidth, h = 74
      const x = d3.scaleBand<number>().domain(AGES).range([30, w - 8]).padding(0.18)
      const y = d3.scaleLinear().domain([0, d3.max(AGES, (a) => counts.get(a) || 0)!]).range([h - 18, 4])
      bars
        .selectAll<SVGRectElement, number>('rect')
        .data(AGES)
        .join('rect')
        .attr('x', (a) => x(a)!)
        .attr('width', x.bandwidth())
        .attr('y', (a) => y(counts.get(a) || 0))
        .attr('height', (a) => h - 18 - y(counts.get(a) || 0))
        .attr('rx', 2)
        .attr('fill', (a) => (a === age ? 'var(--accent)' : 'var(--border)'))
        .attr('opacity', (a) => (a === age ? 1 : 0.7))
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
        .attr('font-size', 10.5)
        .attr('fill', 'var(--text-2)')
        .text((a) => (a === 13 ? '13+' : a))
      bars
        .selectAll<SVGTextElement, number>('text.cnt')
        .data([age])
        .join('text')
        .attr('class', 'cnt')
        .attr('x', x(age)! + x.bandwidth() / 2)
        .attr('y', Math.max(10, y(counts.get(age) || 0) - 5))
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 600)
        .attr('fill', 'var(--text)')
        .text(`+${counts.get(age) || 0}`)
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
      if (age >= 13) setAge(4)
      playTimer = setInterval(() => {
        if (age >= 13) {
          stopPlay()
          return
        }
        setAge(age + 1)
      }, reducedMotion ? 400 : 1100)
    }
    slider.addEventListener('input', onSlider)
    playBtn.addEventListener('click', onPlay)

    function findActiveAt(ev: PointerEvent): number | null {
      const [mx, my] = d3.pointer(ev, cv.canvas)
      const hitRadius = Math.max(10, Math.min(cv.w, cv.h) / 90)
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
      .on('pointermove', (ev: PointerEvent) => {
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
        tip
          .html(
            `<div class="tip-name">${p.name}</div>
             <div class="tip-sub">${p.subject} · ${p.domain} · ages ${p.a0}–${p.a1}</div>
             <div class="tip-desc">${p.desc.length > 220 ? p.desc.slice(0, 220) + '…' : p.desc}</div>`,
          )
          .style('opacity', '1')
        const tw = tipEl.offsetWidth, th = tipEl.offsetHeight
        tip
          .style('left', Math.min(ev.clientX + 14, window.innerWidth - tw - 8) + 'px')
          .style('top', Math.max(Math.min(ev.clientY - 20, window.innerHeight - th - 8), 8) + 'px')
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
    setAge(4, false)

    return () => {
      slider.removeEventListener('input', onSlider)
      playBtn.removeEventListener('click', onPlay)
      ro.disconnect()
      if (playTimer) clearInterval(playTimer)
      if (flashTimer) flashTimer.stop()
      bars.selectAll('*').remove()
      canvas.on('pointermove', null).on('pointerleave', null)
      wrap.removeChild(cv.canvas)
    }
  }, [data])

  return (
    <div className="age-map">
      <div className="controls">
        <button ref={playRef} type="button">
          Play
        </button>
        <label>
          age{' '}
          <input ref={sliderRef} type="range" min={4} max={13} step={1} defaultValue={4} />
        </label>
        <span ref={readoutRef} className="age-readout" />
      </div>
      <div ref={wrapRef} className="age-canvas-wrap" />
      <svg ref={barsRef} className="age-bars" />
      <div ref={tipRef} className="tip" />
    </div>
  )
}
