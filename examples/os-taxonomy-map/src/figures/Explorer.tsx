import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { FigureProps } from './registry'
import { useFigureHighlight } from '../store'
import {
  drawHaloText,
  GRAY,
  makeCanvas,
  px,
  py,
  reducedMotion,
  SUBJECT_COLOR,
  SUBJECTS,
  themeColors,
  useTaxonomy,
  type Edge,
  type View,
} from './lib/taxonomy'

// Figure 3 — the explorer. Click a topic to trace what it builds on (solid
// lines back through every ancestor) and what it unlocks (dashed). Hover for
// descriptions, scroll to zoom, filter by subject chips, age window, or search.

const TERM_TOPICS: Record<string, string> = {
  'egyptian-maths': 'Egyptian Maths and Engineering',
  'unit-fractions': 'Unit fractions',
  pyramids: 'Pyramids and the Great Sphinx',
  'three-d-shapes': '3-D shapes',
}

export default function Explorer({ figureId }: FigureProps) {
  const data = useTaxonomy()
  const { activePart } = useFigureHighlight(figureId)
  const activePartRef = useRef(activePart)
  const renderRef = useRef<(() => void) | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const ageBrushRef = useRef<SVGSVGElement>(null)
  const ageReadoutRef = useRef<HTMLSpanElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activePartRef.current = activePart
    renderRef.current?.()
  }, [activePart])

  useEffect(() => {
    const wrap = wrapRef.current
    const panel = panelRef.current
    const chipsEl = chipsRef.current
    const search = searchRef.current
    const results = resultsRef.current
    const ageBrushEl = ageBrushRef.current
    const ageReadout = ageReadoutRef.current
    const resetBtn = resetRef.current
    const tipEl = tipRef.current
    if (!data || !wrap || !panel || !chipsEl || !search || !results || !ageBrushEl || !ageReadout || !resetBtn || !tipEl) return
    const { pts, prereqsOf, dependentsOf, clusters, byName } = data

    const cv = makeCanvas(wrap, 0.95)
    const baseView: View = { cx: 0, cy: 0, k: 1 }

    const state = {
      selected: null as number | null,
      hovered: null as number | null,
      ageLo: 4,
      ageHi: 15,
      subjectsOn: new Set(SUBJECTS),
      transform: d3.zoomIdentity,
    }

    let bx: number[] = [], by: number[] = []
    let quad: d3.Quadtree<number> | null = null
    function computeBase() {
      bx = pts.map((p) => px(p.x, baseView, cv.w, cv.h))
      by = pts.map((p) => py(p.y, baseView, cv.w, cv.h))
      quad = d3
        .quadtree<number>()
        .x((i) => bx[i])
        .y((i) => by[i])
        .addAll(pts.map((p) => p.i))
    }
    computeBase()

    const passes = (p: (typeof pts)[number]) =>
      state.subjectsOn.has(p.subject) && p.a0 <= state.ageHi && p.a1 >= state.ageLo

    function ancestors(i: number) {
      const depth = new Map<number, number>([[i, 0]])
      const q = [i]
      const used: { e: Edge; d: number }[] = []
      while (q.length) {
        const n = q.shift()!
        for (const e of prereqsOf[n]) {
          used.push({ e, d: depth.get(n)! + 1 })
          if (!depth.has(e.p)) {
            depth.set(e.p, depth.get(n)! + 1)
            q.push(e.p)
          }
        }
      }
      return { depth, edges: used }
    }

    const tip = d3.select(tipEl)

    function render() {
      const { ctx, w, h } = cv
      const theme = themeColors(wrap!)
      const accent = getComputedStyle(wrap!).getPropertyValue('--accent').trim() || '#2563eb'
      const t = state.transform
      ctx.clearRect(0, 0, w, h)
      const X = (i: number) => t.applyX(bx[i])
      const Y = (i: number) => t.applyY(by[i])
      const r = Math.max(2, Math.min(w, h) / 270) * Math.sqrt(Math.min(t.k, 5)) * 0.85
      const termTopic = activePartRef.current ? TERM_TOPICS[activePartRef.current] : undefined
      const annotated = termTopic ? (byName.get(termTopic)?.i ?? null) : null

      let anc: ReturnType<typeof ancestors> | null = null
      let deps: Edge[] | null = null
      if (state.selected != null) {
        anc = ancestors(state.selected)
        deps = dependentsOf[state.selected]
      }
      const inStory = (i: number) => Boolean(anc && (anc.depth.has(i) || deps!.some((e) => e.t === i)))

      // A hover previews the same recursive prerequisite ancestry as a
      // selection, but as a muted layer beneath the points.
      const hoverAnc = state.hovered != null && state.hovered !== state.selected
        ? ancestors(state.hovered)
        : null
      if (hoverAnc) {
        ctx.lineCap = 'round'
        ctx.setLineDash([])
        for (const { e, d } of hoverAnc.edges) {
          ctx.beginPath()
          ctx.moveTo(X(e.t), Y(e.t))
          ctx.lineTo(X(e.p), Y(e.p))
          ctx.strokeStyle = theme.text2
          ctx.globalAlpha = Math.max(0.08, 0.32 / d)
          ctx.lineWidth = d === 1 ? 1.15 : 0.75
          ctx.stroke()
        }
      }

      // Filtered points remain as smaller gray geographic context. Drawing
      // them first keeps the selected subject crisp on top of the field.
      for (const active of [false, true]) {
        for (const p of pts) {
          const i = p.i
          const x = X(i), y = Y(i)
          if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue
          const ok = passes(p)
          if (ok !== active) continue
          let alpha = ok ? 0.95 : 0.36
          if (anc) alpha = inStory(i) ? (ok ? 0.98 : 0.56) : ok ? 0.34 : 0.22
          ctx.beginPath()
          ctx.arc(x, y, ok ? r + 0.5 : Math.max(1, r - 0.9), 0, 6.2832)
          ctx.fillStyle = ok ? SUBJECT_COLOR[p.subject] : GRAY
          ctx.globalAlpha = alpha
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      if (anc) {
        ctx.lineCap = 'round'
        for (const { e, d } of anc.edges) {
          ctx.beginPath()
          ctx.moveTo(X(e.t), Y(e.t))
          ctx.lineTo(X(e.p), Y(e.p))
          ctx.strokeStyle = theme.text
          ctx.globalAlpha = Math.max(0.12, 0.7 / d)
          ctx.lineWidth = d === 1 ? 1.8 : 1
          ctx.setLineDash([])
          ctx.stroke()
        }
        for (const e of deps!) {
          ctx.beginPath()
          ctx.moveTo(X(e.p), Y(e.p))
          ctx.lineTo(X(e.t), Y(e.t))
          ctx.strokeStyle = accent
          ctx.globalAlpha = 0.55
          ctx.lineWidth = 1.2
          ctx.setLineDash([4, 4])
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        const sel = pts[state.selected!]
        ctx.beginPath()
        ctx.arc(X(sel.i), Y(sel.i), r + 3, 0, 6.2832)
        ctx.strokeStyle = theme.text
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.font = "700 12.5px 'Source Sans 3', sans-serif"
        const tw2 = ctx.measureText(sel.name).width
        const lx = Math.max(tw2 / 2 + 4, Math.min(w - tw2 / 2 - 4, X(sel.i)))
        drawHaloText(ctx, sel.name, lx, Y(sel.i) - r - 10, { size: 12.5, weight: 700, color: theme.text, halo: theme.halo })
      }

      if (state.hovered != null) {
        const p = pts[state.hovered]
        ctx.beginPath()
        ctx.arc(X(p.i), Y(p.i), r + 3, 0, 6.2832)
        ctx.strokeStyle = theme.text2
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      if (annotated != null) {
        const p = pts[annotated]
        ctx.beginPath()
        ctx.arc(X(p.i), Y(p.i), r + 1, 0, 6.2832)
        ctx.fillStyle = SUBJECT_COLOR[p.subject]
        ctx.globalAlpha = 1
        ctx.fill()
        ctx.beginPath()
        ctx.arc(X(p.i), Y(p.i), r + 5, 0, 6.2832)
        ctx.strokeStyle = SUBJECT_COLOR[p.subject]
        ctx.lineWidth = 2.5
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      if (t.k < 3) {
        const minN = t.k < 1.6 ? 25 : 12
        for (const c of clusters) {
          if (c.n < minN) continue
          const x = t.applyX(px(c.cx, baseView, w, h)), y = t.applyY(py(c.cy, baseView, w, h))
          if (x < 0 || x > w || y < 0 || y > h) continue
          drawHaloText(ctx, c.label, x, y, { size: 10.5, weight: 600, color: theme.text2, halo: theme.halo })
        }
      }
    }
    renderRef.current = render

    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.9, 14])
      .on('zoom', (ev) => {
        state.transform = ev.transform
        render()
      })
    const sel = d3.select(cv.canvas as HTMLCanvasElement)
    sel.call(zoom).on('dblclick.zoom', null)

    function findAt(ev: PointerEvent | MouseEvent): number | null {
      const [mx, my] = d3.pointer(ev, cv.canvas)
      const t = state.transform
      const i = quad!.find(t.invertX(mx), t.invertY(my), 30 / t.k)
      if (i == null) return null
      const dx = t.applyX(bx[i]) - mx, dy = t.applyY(by[i]) - my
      return dx * dx + dy * dy < 14 * 14 ? i : null
    }

    sel
      .on('pointermove', (ev: PointerEvent) => {
        const i = findAt(ev)
        if (i !== state.hovered) {
          state.hovered = i
          render()
        }
        if (i != null) {
          const p = pts[i]
          tip
            .html(
              `<div class="tip-name">${p.name}</div>
              <div class="tip-sub">${p.subject} · ${p.domain} · ages ${p.a0}–${p.a1}</div>
              <div class="tip-desc">${p.desc.length > 220 ? p.desc.slice(0, 220) + '…' : p.desc}</div>`,
            )
            .style('opacity', '1')
          const tw = tipEl.offsetWidth, th = tipEl.offsetHeight
          const rect = cv.canvas.getBoundingClientRect()
          const sx = rect.left + state.transform.applyX(bx[i]) * (rect.width / cv.w)
          const sy = rect.top + state.transform.applyY(by[i]) * (rect.height / cv.h)
          const left = sx + tw + 10 <= window.innerWidth - 8 ? sx + 10 : sx - tw - 10
          const top = sy + th + 10 <= window.innerHeight - 8 ? sy + 10 : sy - th - 10
          tip
            .style('left', Math.max(8, Math.min(left, window.innerWidth - tw - 8)) + 'px')
            .style('top', Math.max(8, Math.min(top, window.innerHeight - th - 8)) + 'px')
          cv.canvas.style.cursor = 'pointer'
        } else {
          tip.style('opacity', '0')
          cv.canvas.style.cursor = 'crosshair'
        }
      })
      .on('pointerleave', () => {
        state.hovered = null
        tip.style('opacity', '0')
        render()
      })
      .on('click', (ev: MouseEvent) => {
        const i = findAt(ev)
        if (i != null) select(i)
      })

    function select(i: number | null, pan = false) {
      state.selected = i
      renderPanel()
      render()
      if (pan && i != null) {
        const p = pts[i]
        const k = Math.max(state.transform.k, 3)
        const tx = cv.w / 2 - k * px(p.x, baseView, cv.w, cv.h)
        const ty = cv.h / 2 - k * py(p.y, baseView, cv.w, cv.h)
        sel
          .transition()
          .duration(reducedMotion ? 0 : 600)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k))
      }
    }

    function linkItem(e: Edge, other: number, showReason: boolean) {
      const p = pts[other]
      return `<div class="link-item" data-i="${other}" style="border-left-color:${SUBJECT_COLOR[p.subject]}">
        <span class="li-name">${p.name}</span>
        <span class="li-tag">${e.hard ? 'hard' : 'soft'} · ages ${p.a0}–${p.a1}</span>
        ${showReason ? `<div class="li-reason">${e.reason}</div>` : ''}
      </div>`
    }

    function renderPanel() {
      if (state.selected == null) {
        panel!.innerHTML = `<h4>Click a topic</h4>
          <div class="sub">or search above</div>
          <div class="desc">Selecting a topic traces every prerequisite behind it and everything it unlocks.
          Solid dark lines look backward; dashed blue lines look forward.</div>`
        return
      }
      const p = pts[state.selected]
      const pre = prereqsOf[p.i]
      const dep = dependentsOf[p.i]
      const anc = ancestors(p.i)
      panel!.innerHTML = `
        <h4>${p.name}</h4>
        <div class="sub"><span style="color:${SUBJECT_COLOR[p.subject]}">●</span>
          ${p.subject} · ${p.domain} · ages ${p.a0}–${p.a1} · ${p.type.toLowerCase()}</div>
        <div class="desc">${p.desc}</div>
        <h5>Builds on ${pre.length} topic${pre.length === 1 ? '' : 's'}
          (${anc.depth.size - 1} in the full ancestry)</h5>
        ${pre.map((e) => linkItem(e, e.p, true)).join('') || '<div class="sub">Nothing. This is bedrock.</div>'}
        <h5>Unlocks ${dep.length} topic${dep.length === 1 ? '' : 's'}</h5>
        ${dep.map((e) => linkItem(e, e.t, false)).join('') || '<div class="sub">Nothing downstream in v1.</div>'}
      `
      panel!.querySelectorAll('.link-item').forEach((el) =>
        el.addEventListener('click', () => select(+(el as HTMLElement).dataset.i!, true)),
      )
    }

    // subject chips
    chipsEl.innerHTML = SUBJECTS.map(
      (s) => `<span class="chip" data-s="${s}"><span class="dot" style="background:${SUBJECT_COLOR[s]}"></span>${s}</span>`,
    ).join('')
    chipsEl.querySelectorAll('.chip').forEach((el) =>
      el.addEventListener('click', () => {
        const s = (el as HTMLElement).dataset.s!
        state.subjectsOn = new Set([s])
        chipsEl.querySelectorAll<HTMLElement>('.chip').forEach((chip) =>
          chip.classList.toggle('off', chip.dataset.s !== s),
        )
        render()
      }),
    )

    // One range brush replaces the two independent sliders. The selection is
    // snapped to whole ages on release, while the handles remain keyboard
    // adjustable for the same range without requiring a pointer.
    const brushSvg = d3.select(ageBrushEl)
    const brushWidth = Math.max(220, ageBrushEl.clientWidth || 240)
    const brushHeight = 42
    ageBrushEl.setAttribute('viewBox', `0 0 ${brushWidth} ${brushHeight}`)
    const ageScale = d3.scaleLinear().domain([4, 15]).range([12, brushWidth - 12])
    const brushGroup = brushSvg.append('g').attr('class', 'age-brush-g')
    brushGroup
      .append('line')
      .attr('class', 'age-brush-track')
      .attr('x1', ageScale(4))
      .attr('x2', ageScale(15))
      .attr('y1', 13)
      .attr('y2', 13)
    brushGroup
      .selectAll<SVGLineElement, number>('line.age-brush-tick')
      .data(d3.range(4, 16))
      .join('line')
      .attr('class', 'age-brush-tick')
      .attr('x1', (a) => ageScale(a))
      .attr('x2', (a) => ageScale(a))
      .attr('y1', 9)
      .attr('y2', 17)
    brushGroup
      .selectAll<SVGTextElement, number>('text.age-brush-label')
      .data([4, 7, 10, 13, 15])
      .join('text')
      .attr('class', 'age-brush-label')
      .attr('x', (a) => ageScale(a))
      .attr('y', 34)
      .attr('text-anchor', 'middle')
      .text((a) => a)

    let syncingBrush = false
    const clampAge = (a: number) => Math.max(4, Math.min(15, Math.round(a)))
    const ageBrush = d3
      .brushX<unknown>()
      .extent([
        [ageScale(4), 3],
        [ageScale(15), 23],
      ])
      .handleSize(10)
      .on('brush end', (ev) => {
        if (syncingBrush || !ev.selection) return
        const [x0, x1] = ev.selection as [number, number]
        state.ageLo = clampAge(ageScale.invert(x0))
        state.ageHi = clampAge(ageScale.invert(x1))
        if (state.ageLo > state.ageHi) state.ageLo = state.ageHi
        updateAgeBrushA11y()
        render()
        if (ev.type === 'end') moveAgeBrush(state.ageLo, state.ageHi)
      })
    brushGroup.call(ageBrush)

    function updateAgeBrushA11y() {
      ageReadout!.textContent = `${state.ageLo}–${state.ageHi}`
      brushGroup
        .selectAll<SVGRectElement, { type: 'w' | 'e' }>('.handle')
        .attr('aria-valuemin', 4)
        .attr('aria-valuemax', 15)
        .attr('aria-valuenow', (d) => (d.type === 'w' ? state.ageLo : state.ageHi))
        .attr('aria-label', (d) => (d.type === 'w' ? 'Minimum age' : 'Maximum age'))
    }

    function moveAgeBrush(lo: number, hi: number) {
      state.ageLo = clampAge(lo)
      state.ageHi = clampAge(hi)
      syncingBrush = true
      brushGroup.call(ageBrush.move, [ageScale(state.ageLo), ageScale(state.ageHi)])
      syncingBrush = false
      updateAgeBrushA11y()
      render()
    }

    brushGroup
      .selectAll<SVGRectElement, { type: 'w' | 'e' }>('.handle')
      .attr('tabindex', 0)
      .attr('role', 'slider')
      .on('keydown', (ev: KeyboardEvent, d) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return
        ev.preventDefault()
        const delta = ev.key === 'ArrowRight' ? 1 : -1
        if (d.type === 'w') moveAgeBrush(Math.min(state.ageHi, state.ageLo + delta), state.ageHi)
        else moveAgeBrush(state.ageLo, Math.max(state.ageLo, state.ageHi + delta))
      })
    moveAgeBrush(4, 15)

    const onSearch = () => {
      const q = search.value.trim().toLowerCase()
      if (q.length < 2) {
        results.style.display = 'none'
        return
      }
      const hits = pts.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
      results.innerHTML =
        hits
          .map(
            (p) =>
              `<div data-i="${p.i}"><span style="color:${SUBJECT_COLOR[p.subject]}">●</span> ${p.name}
         <span class="sr-sub">${p.subject}, ages ${p.a0}–${p.a1}</span></div>`,
          )
          .join('') || '<div class="sr-sub" style="padding:0.4rem 0.6rem">No matches</div>'
      results.style.display = 'block'
      results.querySelectorAll('div[data-i]').forEach((el) =>
        el.addEventListener('click', () => {
          results.style.display = 'none'
          search.value = pts[+(el as HTMLElement).dataset.i!].name
          select(+(el as HTMLElement).dataset.i!, true)
        }),
      )
    }
    search.addEventListener('input', onSearch)
    const onDocClick = (ev: MouseEvent) => {
      if (!results.contains(ev.target as Node) && ev.target !== search) results.style.display = 'none'
    }
    document.addEventListener('click', onDocClick)

    const onReset = () => {
      moveAgeBrush(4, 15)
      state.subjectsOn = new Set(SUBJECTS)
      chipsEl.querySelectorAll('.chip').forEach((el) => el.classList.remove('off'))
      search.value = ''
      state.selected = null
      renderPanel()
      sel.transition().duration(reducedMotion ? 0 : 500).call(zoom.transform, d3.zoomIdentity)
    }
    resetBtn.addEventListener('click', onReset)

    const ro = new ResizeObserver(() => {
      if (cv.resize()) {
        computeBase()
        render()
      }
    })
    ro.observe(wrap)

    // default: the cross-map story
    const dflt = byName.get('Egyptian Maths and Engineering')
    select(dflt ? dflt.i : 0)

    return () => {
      search.removeEventListener('input', onSearch)
      document.removeEventListener('click', onDocClick)
      resetBtn.removeEventListener('click', onReset)
      ro.disconnect()
      brushSvg.selectAll('*').remove()
      sel.on('.zoom', null).on('pointermove', null).on('pointerleave', null).on('click', null)
      renderRef.current = null
      wrap.removeChild(cv.canvas)
    }
  }, [data])

  return (
    <div className="explorer">
      <div className="controls">
        <div className="search-wrap">
          <input ref={searchRef} type="text" placeholder="Search topics…" autoComplete="off" />
          <div ref={resultsRef} className="search-results" />
        </div>
        <div className="age-brush-control">
          <span>ages</span>
          <svg ref={ageBrushRef} className="age-brush" aria-label="Filter topics by age range" />
          <span ref={ageReadoutRef} className="ex-age-readout" />
        </div>
        <button ref={resetRef} type="button">
          Reset
        </button>
      </div>
      <div ref={chipsRef} className="chips" style={{ marginBottom: '0.75rem' }} />
      <div className="explorer-body">
        <div className="explorer-map">
          <div ref={wrapRef} className="ex-canvas-wrap" />
        </div>
        <div ref={panelRef} className="explorer-panel" />
      </div>
      <div ref={tipRef} className="tip" />
    </div>
  )
}
