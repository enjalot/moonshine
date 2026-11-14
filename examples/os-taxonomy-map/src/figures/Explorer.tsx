import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { FigureProps } from './registry'
import { useFigureHighlight } from '../store'
import { str } from './lib/params'
import {
  drawHaloText,
  esc,
  GRAY,
  MIN_LABEL_PX,
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

// Figure 3: the prerequisite graph drawn on the map. One topic is always
// selected; solid lines run back through every ancestor and dashed lines
// run forward to what it unlocks. It opens on the article's example
// (DEFAULTS.topic), the edge that crosses the whole map.
//
// Term links in the prose name topics (`to=explorer.unit-fractions`).
// Hovering one previews that topic's lines without changing the selection;
// clicking one selects it.

export const DEFAULTS = {
  // The topic selected before the reader touches anything.
  topic: 'Egyptian Maths and Engineering',
}

const TERM_TOPICS: Record<string, string> = {
  'egyptian-maths': 'Egyptian Maths and Engineering',
  'unit-fractions': 'Unit fractions',
  pyramids: 'Pyramids and the Great Sphinx',
  'three-d-shapes': '3-D shapes',
  pompeii: 'Pompeii & Vesuvius',
}

export default function Explorer({ figureId, ...props }: FigureProps) {
  const startTopic = str(props.topic, DEFAULTS.topic)
  const data = useTaxonomy()
  const { hoveredPart, pinnedPart } = useFigureHighlight(figureId)
  const termRef = useRef<((hover: string | undefined, pin: string | undefined) => void) | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const zoomInRef = useRef<HTMLButtonElement>(null)
  const zoomOutRef = useRef<HTMLButtonElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const panel = panelRef.current
    const chipsEl = chipsRef.current
    const search = searchRef.current
    const results = resultsRef.current
    const zoomInBtn = zoomInRef.current
    const zoomOutBtn = zoomOutRef.current
    const resetBtn = resetRef.current
    const tipEl = tipRef.current
    if (!data || !wrap || !panel || !chipsEl || !search || !results || !zoomInBtn || !zoomOutBtn || !resetBtn || !tipEl) return
    const { pts, prereqsOf, dependentsOf, clusters, byName } = data

    const cv = makeCanvas(wrap, (w) => (w < 480 ? 0.95 : 0.82))
    const baseView: View = { cx: 0, cy: 0, k: 1 }

    const state = {
      selected: null as number | null,
      hovered: null as number | null,
      // A topic borrowed by a hovered term link in the prose.
      preview: null as number | null,
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

    const passes = (p: (typeof pts)[number]) => state.subjectsOn.has(p.subject)

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
      // The story drawn is the previewed topic's if a term is hovered,
      // otherwise the selected topic's.
      const focus = state.preview ?? state.selected

      let anc: ReturnType<typeof ancestors> | null = null
      let deps: Edge[] | null = null
      if (focus != null) {
        anc = ancestors(focus)
        deps = dependentsOf[focus]
      }
      const inStory = (i: number) => Boolean(anc && (anc.depth.has(i) || deps!.some((e) => e.t === i)))

      // A hover previews the same recursive prerequisite ancestry as a
      // selection, but as a muted layer beneath the points.
      const hoverAnc = state.hovered != null && state.hovered !== focus
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
        const sel = pts[focus!]
        ctx.beginPath()
        ctx.arc(X(sel.i), Y(sel.i), r + 3, 0, 6.2832)
        ctx.strokeStyle = theme.text
        ctx.lineWidth = 2
        ctx.stroke()
      }

      if (state.hovered != null) {
        const p = pts[state.hovered]
        ctx.beginPath()
        ctx.arc(X(p.i), Y(p.i), r + 3, 0, 6.2832)
        ctx.strokeStyle = theme.text2
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Labels are placed greedily: the focused topic first, then cluster
      // names from largest to smallest, skipping any that would collide.
      const placed: [number, number, number, number][] = []
      const place = (text: string, x: number, y: number, weight: number, color: string) => {
        // A label pulled in from far outside the view would point at nothing.
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return
        ctx.font = `${weight} ${MIN_LABEL_PX}px 'Source Sans 3', sans-serif`
        const tw = ctx.measureText(text).width
        if (tw + 8 > w) return
        const cx = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, x))
        const cy = Math.max(10, Math.min(h - 10, y))
        const box: [number, number, number, number] = [cx - tw / 2 - 3, cy - 9, cx + tw / 2 + 3, cy + 9]
        if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return
        placed.push(box)
        drawHaloText(ctx, text, cx, cy, { size: MIN_LABEL_PX, weight, color, halo: theme.halo })
      }
      if (focus != null) {
        const p = pts[focus]
        const above = Y(p.i) - r - 12
        place(p.name, X(p.i), above > 12 ? above : Y(p.i) + r + 12, 700, theme.text)
        // Name the far ends of its direct prerequisites, so a line that
        // crosses the map says where it lands.
        for (const e of prereqsOf[focus].slice(0, 4)) {
          const q = pts[e.p]
          ctx.beginPath()
          ctx.arc(X(q.i), Y(q.i), r + 2.5, 0, 6.2832)
          ctx.strokeStyle = theme.text
          ctx.lineWidth = 1.2
          ctx.stroke()
          place(q.name, X(q.i), Y(q.i) - r - 12, 600, theme.text)
        }
      }
      if (t.k < 3) {
        const minN = t.k < 1.6 ? (w < 480 ? 33 : 25) : 12
        for (const c of [...clusters].sort((a, b) => b.n - a.n)) {
          if (c.n < minN) continue
          const x = t.applyX(px(c.cx, baseView, w, h)), y = t.applyY(py(c.cy, baseView, w, h))
          if (x < 0 || x > w || y < 0 || y > h) continue
          place(c.label, x, y, 600, theme.text2)
        }
      }
    }

    // The map shares the page with prose, so it must not swallow page
    // scrolling: the wheel zooms only with Ctrl/Cmd held, and one finger
    // pans the map only once it is zoomed in (before that it scrolls the
    // page). The + and − buttons zoom without either.
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 14])
      .filter((ev: Event) => {
        if (ev.type === 'wheel') return (ev as WheelEvent).ctrlKey || (ev as WheelEvent).metaKey
        if (ev.type.startsWith('touch')) return state.transform.k > 1.01
        return !(ev as MouseEvent).button
      })
      .on('zoom', (ev) => {
        state.transform = ev.transform
        cv.canvas.style.touchAction = ev.transform.k > 1.01 ? 'none' : 'pan-y'
        render()
      })
    const sel = d3.select(cv.canvas as HTMLCanvasElement)
    sel.call(zoom).on('dblclick.zoom', null)
    cv.canvas.style.touchAction = 'pan-y'
    // The buttons zoom around the selected topic when it is in view, so
    // zooming in keeps the thing being read about on screen.
    const zoomBy = (f: number) => {
      const t = state.transform
      const i = state.selected
      const at: [number, number] | undefined =
        i != null && t.applyX(bx[i]) >= 0 && t.applyX(bx[i]) <= cv.w && t.applyY(by[i]) >= 0 && t.applyY(by[i]) <= cv.h
          ? [t.applyX(bx[i]), t.applyY(by[i])]
          : undefined
      sel.transition().duration(reducedMotion ? 0 : 300).call(zoom.scaleBy, f, at)
    }
    const onZoomIn = () => zoomBy(1.8)
    const onZoomOut = () => zoomBy(1 / 1.8)
    zoomInBtn.addEventListener('click', onZoomIn)
    zoomOutBtn.addEventListener('click', onZoomOut)

    const startIndex = byName.get(startTopic)?.i ?? byName.get(DEFAULTS.topic)?.i ?? 0

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
        if (i != null && ev.pointerType !== 'touch') {
          const p = pts[i]
          tip
            .html(
              `<div class="tip-name">${esc(p.name)}</div>
              <div class="tip-sub">${esc(p.subject)} · ${esc(p.domain)} · ages ${p.a0}–${p.a1}</div>
              <div class="tip-desc">${esc(p.desc.length > 220 ? p.desc.slice(0, 220) + '…' : p.desc)}</div>`,
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
          cv.canvas.style.cursor = i != null ? 'pointer' : state.transform.k > 1.01 ? 'grab' : 'default'
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
      describe()
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

    function describe() {
      const base = 'Map of 1,590 curriculum topics colored by subject, with prerequisite lines for one selected topic.'
      if (state.selected == null) {
        cv.canvas.setAttribute('aria-label', base + ' No topic is selected.')
        return
      }
      const p = pts[state.selected]
      const names = (es: Edge[], other: (e: Edge) => number) =>
        es.map((e) => `${pts[other(e)].name} (${pts[other(e)].subject})`).join(', ') || 'nothing'
      cv.canvas.setAttribute(
        'aria-label',
        `${base} Selected: ${p.name}, ${p.subject}, ages ${p.a0} to ${p.a1}. ` +
          `It builds on ${names(prereqsOf[p.i], (e) => e.p)} and unlocks ${names(dependentsOf[p.i], (e) => e.t)}. ` +
          'The same information is in the panel next to the map.',
      )
    }

    function linkItem(e: Edge, other: number, showReason: boolean) {
      const p = pts[other]
      return `<button type="button" class="link-item" data-i="${other}" style="border-left-color:${SUBJECT_COLOR[p.subject]}">
        <span class="li-name">${esc(p.name)}</span>
        <span class="li-tag">${esc(p.subject)} · ages ${p.a0}–${p.a1} · ${e.hard ? 'hard' : 'soft'}</span>
        ${showReason ? `<span class="li-reason">${esc(e.reason)}</span>` : ''}
      </button>`
    }

    function renderPanel() {
      if (state.selected == null) {
        panel!.innerHTML = `<h4>No topic selected</h4>
          <div class="desc">Click a dot or search for a topic. Solid lines run back through
          everything it builds on, and dashed lines run forward to what it unlocks.</div>`
        return
      }
      const p = pts[state.selected]
      const pre = prereqsOf[p.i]
      const dep = dependentsOf[p.i]
      const anc = ancestors(p.i)
      panel!.innerHTML = `
        <h4>${esc(p.name)}</h4>
        <div class="sub"><span style="color:${SUBJECT_COLOR[p.subject]}">●</span>
          ${esc(p.subject)} · ${esc(p.domain)} · ages ${p.a0}–${p.a1}</div>
        <div class="desc">${esc(p.desc)}</div>
        <h5>Builds on ${pre.length} topic${pre.length === 1 ? '' : 's'}
          (${anc.depth.size - 1} in the full ancestry)</h5>
        ${pre.map((e) => linkItem(e, e.p, true)).join('') || '<div class="sub">No prerequisites.</div>'}
        <h5>Unlocks ${dep.length} topic${dep.length === 1 ? '' : 's'}</h5>
        ${dep.map((e) => linkItem(e, e.t, false)).join('') || '<div class="sub">Nothing downstream in v1 of the taxonomy.</div>'}
      `
      panel!.querySelectorAll('.link-item').forEach((el) =>
        el.addEventListener('click', () => select(+(el as HTMLElement).dataset.i!, true)),
      )
    }

    // Subject chips double as the color legend. Clicking one shows that
    // subject alone; clicking it again brings the others back.
    chipsEl.innerHTML = SUBJECTS.map(
      (s) =>
        `<button type="button" class="chip" data-s="${esc(s)}" aria-pressed="false"><span class="dot" style="background:${SUBJECT_COLOR[s]}"></span>${esc(s)}</button>`,
    ).join('')
    const syncChips = () => {
      const solo = state.subjectsOn.size === 1
      chipsEl.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
        const on = state.subjectsOn.has(chip.dataset.s!)
        chip.classList.toggle('off', !on)
        chip.setAttribute('aria-pressed', String(solo && on))
      })
    }
    chipsEl.querySelectorAll<HTMLElement>('.chip').forEach((el) =>
      el.addEventListener('click', () => {
        const s = el.dataset.s!
        const already = state.subjectsOn.size === 1 && state.subjectsOn.has(s)
        state.subjectsOn = new Set(already ? SUBJECTS : [s])
        syncChips()
        render()
      }),
    )

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
              `<button type="button" data-i="${p.i}"><span style="color:${SUBJECT_COLOR[p.subject]}">●</span> ${esc(p.name)}
         <span class="sr-sub">${esc(p.subject)}, ages ${p.a0}–${p.a1}</span></button>`,
          )
          .join('') || '<div class="sr-sub sr-none">No matches</div>'
      results.style.display = 'block'
      results.querySelectorAll('button[data-i]').forEach((el) =>
        el.addEventListener('click', () => {
          results.style.display = 'none'
          search.value = pts[+(el as HTMLElement).dataset.i!].name
          select(+(el as HTMLElement).dataset.i!, true)
        }),
      )
    }
    search.addEventListener('input', onSearch)
    const onSearchKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') results.style.display = 'none'
      if (ev.key === 'Enter') results.querySelector<HTMLElement>('button[data-i]')?.click()
    }
    search.addEventListener('keydown', onSearchKey)
    const onDocClick = (ev: MouseEvent) => {
      if (!results.contains(ev.target as Node) && ev.target !== search) results.style.display = 'none'
    }
    document.addEventListener('click', onDocClick)

    const onReset = () => {
      state.subjectsOn = new Set(SUBJECTS)
      syncChips()
      search.value = ''
      results.style.display = 'none'
      // Reset returns to the opening view, which has a topic selected.
      state.selected = startIndex
      renderPanel()
      describe()
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

    // Term links from the prose: hover previews, click selects.
    const termIndex = (part: string | undefined) =>
      part ? (byName.get(TERM_TOPICS[part] ?? '')?.i ?? null) : null
    let lastPin: number | null = null
    termRef.current = (hover, pin) => {
      const pinned = termIndex(pin)
      if (pinned !== lastPin) {
        lastPin = pinned
        if (pinned != null) select(pinned)
      }
      const preview = termIndex(hover)
      if (preview !== state.preview) {
        state.preview = preview
        render()
      }
    }

    select(startIndex)

    return () => {
      termRef.current = null
      search.removeEventListener('input', onSearch)
      search.removeEventListener('keydown', onSearchKey)
      document.removeEventListener('click', onDocClick)
      resetBtn.removeEventListener('click', onReset)
      zoomInBtn.removeEventListener('click', onZoomIn)
      zoomOutBtn.removeEventListener('click', onZoomOut)
      ro.disconnect()
      sel.on('.zoom', null).on('pointermove', null).on('pointerleave', null).on('click', null)
      wrap.removeChild(cv.canvas)
    }
  }, [data, startTopic])

  // Declared after the effect above so the handler exists when this runs.
  const hoverTopic = typeof hoveredPart === 'string' ? hoveredPart : undefined
  const pinTopic = typeof pinnedPart === 'string' ? pinnedPart : undefined
  useEffect(() => {
    termRef.current?.(hoverTopic, pinTopic)
  }, [hoverTopic, pinTopic, data])

  return (
    <div className="explorer">
      <div ref={chipsRef} className="chips" role="group" aria-label="Subjects (click one to show it alone)" />
      <div className="explorer-body">
        <div className="explorer-map">
          <div ref={wrapRef} className="ex-canvas-wrap" />
          <div className="controls">
            <div className="search-wrap">
              <input ref={searchRef} type="text" placeholder="Find a topic…" aria-label="Find a topic by name" autoComplete="off" />
              <div ref={resultsRef} className="search-results" />
            </div>
            <span className="zoom-buttons">
              <button ref={zoomOutRef} type="button" aria-label="Zoom out">
                −
              </button>
              <button ref={zoomInRef} type="button" aria-label="Zoom in">
                +
              </button>
            </span>
            <button ref={resetRef} type="button">
              Reset
            </button>
          </div>
          <p className="figure-hint">
            Click a dot to select it, or a subject above to show it alone. Zoom with − and + (or Ctrl/Cmd + scroll),
            then drag to move around.
          </p>
        </div>
        <div ref={panelRef} className="explorer-panel" />
      </div>
      <div ref={tipRef} className="tip" />
    </div>
  )
}
