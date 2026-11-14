#!/usr/bin/env node
// Leave suggestions on a still article for the author to accept, edit or
// reject in the page (FEEDBACK.md § Suggestions).
//
//   node suggest.mjs <project> <suggestions.json> [--source "editing pass"]
//   node suggest.mjs <project> --list             what the author decided
//   node suggest.mjs <project> --prune            delete accepted/rejected/sent records
//
// <suggestions.json> ("-" reads stdin) is an array of
//   { "path": "example.md",        content-relative markdown file
//     "find": "exact source text", must occur in the file's body
//     "replace": "new text",       omit for a remark; "" deletes the text
//     "note": "why, in a sentence",
//     "occurrence": 2 }            only when `find` occurs more than once
//
// Every entry is checked against the file before anything is written, and
// nothing is written if any entry fails, so a failed run can be fixed and
// repeated without leaving duplicates. No dependencies; the dev server does
// not need to be running.

import { promises as fs } from 'node:fs'
import path from 'node:path'

const MATTER_RE = /^---(?:\r?\n|\r)(?:([\s\S]*?)(?:\r?\n|\r))?---(?:\r?\n|\r|$)/

// The body exactly as the page holds it: velite trims the file, strips the
// frontmatter block, and trims again.
function bodyOf(source) {
  const src = source.trim()
  const m = src.match(MATTER_RE)
  return m ? src.slice(m[0].length).trim() : src
}

function occurrences(body, find) {
  const out = []
  for (let from = 0; ; ) {
    const i = body.indexOf(find, from)
    if (i === -1) break
    out.push(i)
    from = i + Math.max(1, find.length)
  }
  return out
}

async function readRecords(dir) {
  let names = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      out.push({ file: path.join(dir, name), rec: JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) })
    } catch {
      // unreadable record: leave it alone
    }
  }
  return out.sort((a, b) => String(a.rec.ts).localeCompare(String(b.rec.ts)))
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return null
  const v = args[i + 1]
  args.splice(i, 2)
  return v ?? ''
}
const source = flag('--source')
const list = args.includes('--list')
const prune = args.includes('--prune')
const positional = args.filter((a) => a === '-' || !a.startsWith('--'))
if (positional.length < 1) {
  fail('usage: suggest.mjs <project> <suggestions.json|-> [--source NAME] | <project> --list | <project> --prune')
}
const project = path.resolve(positional[0])
const contentRoot = path.join(project, 'content')
const dir = path.join(project, '.feedback', 'suggestions')

if (list || prune) {
  const records = await readRecords(dir)
  if (prune) {
    let n = 0
    for (const { file, rec } of records) {
      if (['accepted', 'rejected', 'sent'].includes(rec.status)) {
        await fs.unlink(file)
        n++
      }
    }
    console.log(`pruned ${n} resolved suggestion${n === 1 ? '' : 's'}; ${records.length - n} open`)
  } else {
    for (const { rec } of records) {
      const what = rec.note ?? String(rec.find).slice(0, 70)
      console.log(`${String(rec.status ?? 'open').padEnd(8)} ${rec.id}  ${rec.path}  ${what}`)
      if (typeof rec.appliedText === 'string') {
        console.log(`         author applied instead: ${JSON.stringify(rec.appliedText)}`)
      }
    }
    if (records.length === 0) console.log('no suggestions')
  }
  process.exit(0)
}

if (positional.length < 2) fail('missing <suggestions.json> (or "-" for stdin)')
const raw =
  positional[1] === '-'
    ? await new Promise((resolve) => {
        let s = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (d) => (s += d))
        process.stdin.on('end', () => resolve(s))
      })
    : await fs.readFile(positional[1], 'utf8')
let input
try {
  input = JSON.parse(raw)
} catch (err) {
  fail(`suggestions file is not valid JSON: ${err.message}`)
}
if (!Array.isArray(input)) fail('suggestions file must be a JSON array')

const existing = (await readRecords(dir)).map((r) => r.rec)
const bodies = new Map()
const errors = []
const records = []
const stamp = Date.now()

for (const [i, entry] of input.entries()) {
  const where = `#${i + 1}`
  if (!entry || typeof entry.path !== 'string' || typeof entry.find !== 'string' || !entry.find) {
    errors.push(`${where}: needs string "path" and non-empty "find"`)
    continue
  }
  if (entry.replace !== undefined && typeof entry.replace !== 'string') {
    errors.push(`${where}: "replace" must be a string when present`)
    continue
  }
  if (entry.replace === entry.find) {
    errors.push(`${where}: "replace" is identical to "find"`)
    continue
  }
  if (entry.replace === undefined && !entry.note) {
    errors.push(`${where}: a remark (no "replace") needs a "note"`)
    continue
  }
  const file = path.resolve(contentRoot, entry.path)
  if (!file.startsWith(contentRoot + path.sep) || !file.endsWith('.md')) {
    errors.push(`${where}: path must be a markdown file under content/ (got ${entry.path})`)
    continue
  }
  if (!bodies.has(file)) {
    try {
      bodies.set(file, bodyOf(await fs.readFile(file, 'utf8')))
    } catch {
      errors.push(`${where}: cannot read content/${entry.path}`)
      continue
    }
  }
  const body = bodies.get(file)
  const hits = occurrences(body, entry.find)
  if (hits.length === 0) {
    errors.push(
      `${where}: "find" does not occur in content/${entry.path}. It must match the markdown source exactly (line breaks, quotes, directive syntax): ${JSON.stringify(entry.find.slice(0, 80))}`,
    )
    continue
  }
  let at = hits[0]
  if (hits.length > 1) {
    const n = entry.occurrence
    if (!Number.isInteger(n) || n < 1 || n > hits.length) {
      errors.push(
        `${where}: "find" occurs ${hits.length} times in content/${entry.path}; lengthen it or set "occurrence" (1-${hits.length})`,
      )
      continue
    }
    at = hits[n - 1]
  }
  const dup = existing.find(
    (r) =>
      (r.status ?? 'open') === 'open' &&
      r.path === entry.path &&
      r.find === entry.find &&
      r.replace === entry.replace,
  )
  if (dup) continue
  const rec = {
    id: `sg_${stamp.toString(36)}_${String(i + 1).padStart(3, '0')}`,
    // Staggered so the page lists them in the order given.
    ts: new Date(stamp + i).toISOString(),
    status: 'open',
    path: entry.path,
    find: entry.find,
    at,
  }
  if (entry.replace !== undefined) rec.replace = entry.replace
  if (entry.note) rec.note = String(entry.note)
  const src = entry.source ?? source
  if (src) rec.source = String(src)
  records.push(rec)
}

if (errors.length) {
  fail(`nothing written; ${errors.length} of ${input.length} entries failed:\n  ${errors.join('\n  ')}`)
}

await fs.mkdir(dir, { recursive: true })
for (const rec of records) {
  const file = path.join(dir, `${rec.id}.json`)
  await fs.writeFile(`${file}.tmp`, JSON.stringify(rec, null, 2) + '\n', 'utf8')
  await fs.rename(`${file}.tmp`, file)
}
const skipped = input.length - records.length
console.log(
  `wrote ${records.length} suggestion${records.length === 1 ? '' : 's'} to ${path.relative(process.cwd(), dir) || dir}` +
    (skipped ? ` (${skipped} already open, skipped)` : ''),
)
