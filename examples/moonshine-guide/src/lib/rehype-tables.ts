import { visit, SKIP } from 'unist-util-visit'
import type { Plugin } from 'unified'
import type { Root, Element, ElementContent } from 'hast'

// Give every GFM table the treatment a hand-set data table would get, so
// articles stop carrying per-heading CSS hacks:
//
//   - wrap it in <div class="mn-table"> — the wrapper scrolls sideways
//     on narrow screens, so the table itself keeps real table layout
//     (no `display: block` on <table>, which breaks width and a11y);
//   - tables with many columns get `mn-table-wide` and break out of the
//     prose column like `.figure-wide`;
//   - columns whose body cells are all numbers get `num` on every cell:
//     right-aligned, tabular figures, no wrapping. An explicit GFM
//     alignment (`:---`, `:---:`) always wins over the detection.
//
// The <table> element keeps its source position, so in-place editing
// (EditableBlock) still anchors on it.

const WIDE_COLUMNS = 6

// A "number": optional sign/approx, digits with , or _ grouping, optional
// decimal, optional exponent (1e-3 or 7.3 × 10³), then a short unit/suffix (%, ×, x, GB, ms,
// M, K, s, pp …). Also accepts ranges and ± spreads ("0.81 ± 0.02",
// "12–15"), bracketed intervals, and placeholder dashes for missing
// values.
const NUM = String.raw`[-+−~≈]?\$?\d[\d,_]*(?:\.\d+)?(?:[eE][-+]?\d+|\s?[×x·]\s?10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?\s?(?:%|×|x|[a-zA-Zµ]{1,3}\/?[a-zA-Z]{0,2})?`
const SPREAD = String.raw`(?:\s?(?:±|–|-|to|\/)\s?${NUM})?`
// Interval suffix: "+1.49 [+1.20, +1.76]" or "0.81 (0.78–0.84)".
const INTERVAL = String.raw`(?:\s?[\[(]${NUM}\s?(?:,|–|-|to)\s?${NUM}[\])])?`
const NUMERIC_CELL = new RegExp(String.raw`^(?:${NUM}${SPREAD}${INTERVAL}|[—–-]|n\/a)$`)
const PLACEHOLDER = /^(?:[—–-]|n\/a)$/

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(textOf).join('')
  return ''
}

function rows(el: Element, section: 'thead' | 'tbody'): Element[] {
  const sec = el.children.find(
    (c): c is Element => c.type === 'element' && c.tagName === section,
  )
  if (!sec) return []
  return sec.children.filter(
    (c): c is Element => c.type === 'element' && c.tagName === 'tr',
  )
}

function cells(tr: Element): Element[] {
  return tr.children.filter(
    (c): c is Element => c.type === 'element' && (c.tagName === 'td' || c.tagName === 'th'),
  )
}

function addClass(el: Element, name: string) {
  const prev = el.properties.className
  const list = Array.isArray(prev) ? prev.map(String) : prev ? [String(prev)] : []
  if (!list.includes(name)) list.push(name)
  el.properties.className = list
}

function hasExplicitAlign(el: Element): boolean {
  return Boolean(el.properties.align) || /text-align/.test(String(el.properties.style ?? ''))
}

const rehypeTables: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'table' || !parent || index === undefined) return
    // Already wrapped (plugin ran twice, or authored HTML).
    if (
      parent.type === 'element' &&
      (parent as Element).tagName === 'div' &&
      String((parent as Element).properties.className ?? '').includes('mn-table')
    ) {
      return
    }

    const head = rows(node, 'thead')
    const body = rows(node, 'tbody')
    const ncols = Math.max(0, ...[...head, ...body].map((r) => cells(r).length))

    for (let col = 0; col < ncols; col++) {
      const bodyCells = body.map((r) => cells(r)[col]).filter(Boolean)
      const texts = bodyCells.map((c) => textOf(c).trim()).filter((t) => t !== '')
      const numeric =
        texts.length > 0 &&
        texts.some((t) => !PLACEHOLDER.test(t)) &&
        texts.every((t) => NUMERIC_CELL.test(t))
      if (!numeric) continue
      for (const r of [...head, ...body]) {
        const cell = cells(r)[col]
        if (cell && !hasExplicitAlign(cell)) addClass(cell, 'num')
      }
    }

    const wrapper: Element = {
      type: 'element',
      tagName: 'div',
      properties: {
        className: ncols >= WIDE_COLUMNS ? ['mn-table', 'mn-table-wide'] : ['mn-table'],
      },
      children: [node],
    }
    parent.children[index] = wrapper
    return SKIP
  })
}

export default rehypeTables
