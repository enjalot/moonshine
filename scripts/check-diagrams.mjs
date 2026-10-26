// Measures every DiagramFigure on a page at several screen widths and
// fails if any node label renders below the readability floor.
//
//   node scripts/check-diagrams.mjs <url> [<url>…] [--widths 360,390,768,1100] [--min 13]
//
// Needs playwright-core and a Chromium. Point PLAYWRIGHT_CORE at an
// install if it isn't resolvable from here, and CHROMIUM at a browser
// binary if Playwright's own isn't installed.
//
// The rendered size is measured, not trusted: label font-size times the
// scale on React Flow's viewport transform, read from the DOM.

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = args.indexOf(name)
  if (i < 0) return dflt
  const [v] = args.splice(i, 2).slice(1)
  return v
}
const widths = flag('--widths', '360,390,768,1100').split(',').map(Number)
const min = Number(flag('--min', '13'))
const urls = args
if (!urls.length) {
  console.error('usage: node scripts/check-diagrams.mjs <url> [<url>…] [--widths 360,390,768,1100] [--min 13]')
  process.exit(2)
}

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM
  const root = path.join(homedir(), '.cache/ms-playwright')
  if (!existsSync(root)) return undefined
  const shell = readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop()
  return shell ? path.join(root, shell, 'chrome-headless-shell-linux64/chrome-headless-shell') : undefined
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
let failures = 0

for (const url of urls) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(url, { waitUntil: 'load' })
    // Figures mount lazily on scroll.
    const h = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < h; y += 600) {
      await page.evaluate((y) => window.scrollTo(0, y), y)
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(800)
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.mn-diagram-flow')].map((flow, i) => {
        const vp = flow.querySelector('.react-flow__viewport')
        const scale = vp ? new DOMMatrixReadOnly(getComputedStyle(vp).transform).a : 1
        const sizes = [...flow.querySelectorAll('.mn-flow-label')].map(
          (l) => parseFloat(getComputedStyle(l).fontSize) * scale,
        )
        const scroller = flow.closest('.mn-diagram-scroll')
        return {
          i,
          labels: sizes.length,
          minPx: sizes.length ? Math.min(...sizes) : null,
          layout: flow.dataset.layout,
          scrolls: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false,
        }
      }),
    )
    for (const r of rows) {
      const ok = r.minPx === null || r.minPx >= min - 0.01
      if (!ok) failures++
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${width}px  diagram ${r.i}  labels ${r.minPx?.toFixed(1) ?? '-'}px` +
          `  ${r.layout ?? '?'}${r.scrolls ? ', scrolls' : ''}  ${url}`,
      )
    }
    if (!rows.length) console.log(`--   ${width}px  no diagrams  ${url}`)
    await page.close()
  }
}

await browser.close()
if (failures) {
  console.error(`${failures} diagram(s) render labels below ${min}px`)
  process.exit(1)
}
