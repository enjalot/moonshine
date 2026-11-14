#!/usr/bin/env node
// Bring an existing still project up to the current template.
//
//   node plugins/moonshine/scripts/upgrade-still.mjs <project-dir>          # report only
//   node plugins/moonshine/scripts/upgrade-still.mjs <project-dir> --apply  # make the changes
//
// A still project owns a copy of template/ made when it was bootstrapped,
// so template improvements never reach it on their own. This script works
// out, file by file, what is safe to change, using the template's git
// history as the record of every version a project could have copied:
//
//   unchanged     the project's file is byte-identical to some earlier
//                 template version: the author never touched it, so it is
//                 replaced with the current one.
//   customized    the author edited it: three-way merge (git merge-file)
//                 against the closest earlier template version. A clean
//                 merge is applied; a conflicted one is written next to the
//                 file as <file>.upgrade-merge for the author or agent.
//   new / gone    files the template added are copied in; files it
//                 deleted are removed only if the project's copy is
//                 unchanged.
//   package.json  dependencies and scripts are merged key by key the
//                 same way (template-added keys added, template-dropped
//                 keys removed, author-changed values kept).
//
// It also migrates author data that changed shape:
//
//   content/figures/*.json   pre-0.9 diagram saves (`layout` + `viewport`)
//                            become `nodes`; the viewport is dropped (its
//                            zoom is what shrank labels).
//   src/figures/registry.ts  gains the types newer template components
//                            read (ParamHint, FigureEntry.paramHints).
//   src/figures/*.tsx        figures still calling DiagramFigure with the
//                            pre-0.9 `nodes`/`edges` props are reported.
//                            They keep rendering (DiagramFigure accepts the
//                            old props) until converted to a DiagramSpec.
//
// Article content, figures, registry and config are never touched. Commit
// your work first; --apply refuses when a git project has uncommitted
// changes to tracked files, or an untracked file it would overwrite. Afterwards: npm install, npm run build, look at the diagrams.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.resolve(HERE, '../template')
const REPO = execFileSync('git', ['-C', TEMPLATE, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const TEMPLATE_REL = path.relative(REPO, TEMPLATE)

// Template-owned infrastructure. Everything else in a project (content/,
// public/, the article's figures and registry, moonshine.config.json,
// README.md) belongs to the article.
const INFRA = [
  /^src\/(App|main)\.tsx$/,
  /^src\/store\.ts$/,
  /^src\/vite-env\.d\.ts$/,
  /^src\/components\//,
  /^src\/lib\//,
  /^src\/styles\//,
  /^src\/figures\/(DiagramFigure|AuthoredDiagram|DrawingFigure)\.tsx$/,
  /^src\/figures\/builtin\.ts$/,
  /^src\/figures\/diagram\//,
  /^src\/figures\/drag\//,
  /^src\/figures\/lib\/params\.ts$/,
  /^(vite|velite)\.config\.ts$/,
  /^vite-plugin-[\w-]+\.ts$/,
  /^tsconfig(\.node)?\.json$/,
  /^\.gitignore$/,
  /^\.npmrc$/,
  /^index\.html$/,
]
const isInfra = (rel) => INFRA.some((re) => re.test(rel))

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const project = args.find((a) => !a.startsWith('--'))
if (!project) {
  console.error('usage: upgrade-still.mjs <project-dir> [--apply]')
  process.exit(2)
}
const PROJECT = path.resolve(project)
if (!existsSync(path.join(PROJECT, 'package.json')) || !existsSync(path.join(PROJECT, 'content'))) {
  console.error(`${PROJECT} does not look like a still project (no package.json + content/)`)
  process.exit(2)
}

const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 })
const projectIsRepo = spawnSync('git', ['-C', PROJECT, 'rev-parse', '--git-dir']).status === 0
if (apply && projectIsRepo) {
  const dirty = execFileSync('git', ['-C', PROJECT, 'status', '--porcelain', '--untracked-files=no', '--', '.'], { encoding: 'utf8' }).trim()
  if (dirty) {
    console.error('The project has uncommitted changes. Commit or stash them first, so the upgrade is one reviewable diff.')
    process.exit(1)
  }
}

// ---- template history ----------------------------------------------------

// Every blob a template path has ever had (following renames).
const historyCache = new Map()
function history(rel) {
  if (historyCache.has(rel)) return historyCache.get(rel)
  const out = git('log', '--follow', '--format=', '--raw', '--no-abbrev', '--', `${TEMPLATE_REL}/${rel}`)
  const blobs = new Set()
  for (const line of out.split('\n')) {
    const m = line.match(/^:\d+ \d+ ([0-9a-f]{40}) ([0-9a-f]{40})/)
    if (!m) continue
    for (const b of [m[1], m[2]]) if (!/^0+$/.test(b)) blobs.add(b)
  }
  historyCache.set(rel, blobs)
  return blobs
}
const blobText = (sha) => git('cat-file', '-p', sha)
const hashFile = (file) => execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim()

// Paths the template once had and has since deleted.
function deletedPaths() {
  const out = git('log', '--diff-filter=D', '--name-only', '--format=', '--', TEMPLATE_REL)
  return [...new Set(out.split('\n').filter(Boolean))]
    .map((p) => path.relative(TEMPLATE_REL, p))
    .filter((rel) => !existsSync(path.join(TEMPLATE, rel)) && isInfra(rel))
}

// Closest earlier template version to a customized file: most lines in common.
function closestBase(rel, text) {
  const mine = countLines(text)
  let best = null
  for (const sha of history(rel)) {
    const t = blobText(sha)
    const theirs = countLines(t)
    let common = 0
    for (const [line, n] of theirs) common += Math.min(n, mine.get(line) ?? 0)
    const score = common / Math.max(1, t.split('\n').length)
    if (!best || score > best.score) best = { sha, text: t, score }
  }
  return best
}
function countLines(text) {
  const m = new Map()
  for (const l of text.split('\n')) m.set(l, (m.get(l) ?? 0) + 1)
  return m
}

// Lists of independent lines (.gitignore entries, CSS declarations) merge
// by line where git sees a conflict:
//   - the project and the template each added lines at the same spot: keep
//     the project's, then the template's that are not already there;
//   - a run of custom properties the project re-valued (its palette) and
//     the template added to: keep the project's values, add the template's
//     new properties.
// Returns null if any conflict is something else.
const KEEP_BOTH = /(^|\/)\.gitignore$|\.css$/
const cssProp = (l) => l.match(/^\s*(--[\w-]+)\s*:.*;\s*$/)?.[1]
const cssNoise = (l) => !l.trim() || /^\s*\/\*.*\*\/\s*$/.test(l)
function keepBoth(rel, file, base, theirs) {
  const r = spawnSync('git', ['merge-file', '-p', '--diff3', file, base, theirs], { encoding: 'utf8', maxBuffer: 64 << 20 })
  const out = []
  let part = null // 'mine' | 'base' | 'theirs'
  let [mine, was, add] = [[], [], []]
  for (const line of r.stdout.split('\n')) {
    if (part === null && line.startsWith('<<<<<<< ')) [part, mine, was, add] = ['mine', [], [], []]
    else if (part === 'mine' && line.startsWith('||||||| ')) part = 'base'
    else if (part === 'base' && line === '=======') part = 'theirs'
    else if (part === 'theirs' && line.startsWith('>>>>>>> ')) {
      part = null
      if (!was.length) {
        const have = new Set(mine.map((l) => l.trim()))
        out.push(...mine, ...add.filter((l) => l.trim() && !have.has(l.trim())))
        continue
      }
      const props = [...mine, ...was, ...add].every((l) => cssProp(l) || cssNoise(l))
      if (!rel.endsWith('.css') || !props) return null
      const have = new Set([...mine, ...was].map(cssProp).filter(Boolean))
      out.push(...mine)
      // A template comment travels with the new property that follows it.
      let held = []
      for (const l of add) {
        if (cssNoise(l)) held.push(l)
        else {
          if (!have.has(cssProp(l))) out.push(...held.filter((h) => h.trim()), l)
          held = []
        }
      }
    } else if (part === 'mine') mine.push(line)
    else if (part === 'base') was.push(line)
    else if (part === 'theirs') add.push(line)
    else out.push(line)
  }
  return part === null ? out.join('\n') : null
}

function walk(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.velite', 'dist', '.feedback', '.git'].includes(name)) continue
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, base))
    else out.push(path.relative(base, p))
  }
  return out
}

// ---- plan ----------------------------------------------------------------

const report = { update: [], merge: [], conflict: [], add: [], remove: [], keep: [], current: [] }
const writes = [] // [rel, text]
const deletes = []

const tmp = mkdtempSync(path.join(tmpdir(), 'moonshine-upgrade-'))
for (const rel of walk(TEMPLATE).filter(isInfra).sort()) {
  const theirs = readFileSync(path.join(TEMPLATE, rel), 'utf8')
  const file = path.join(PROJECT, rel)
  if (!existsSync(file)) {
    report.add.push(rel)
    writes.push([rel, theirs])
    continue
  }
  const mine = readFileSync(file, 'utf8')
  if (mine === theirs) {
    report.current.push(rel)
    continue
  }
  if (history(rel).has(hashFile(file))) {
    report.update.push(rel)
    writes.push([rel, theirs])
    continue
  }
  const base = closestBase(rel, mine)
  if (!base) {
    report.keep.push(`${rel} (no template history to merge against)`)
    continue
  }
  const [b, t] = [path.join(tmp, 'base'), path.join(tmp, 'theirs')]
  writeFileSync(b, base.text)
  writeFileSync(t, theirs)
  const r = spawnSync('git', ['merge-file', '-p', '-L', 'project', '-L', 'template-base', '-L', 'template', file, b, t], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  })
  const both = r.status > 0 && KEEP_BOTH.test(rel) ? keepBoth(rel, file, b, t) : null
  if (r.status === 0) {
    report.merge.push(rel)
    writes.push([rel, r.stdout])
  } else if (both) {
    report.merge.push(`${rel} (your lines and values kept, the template's new lines added)`)
    writes.push([rel, both])
  } else {
    report.conflict.push(`${rel} (${r.status} conflict${r.status === 1 ? '' : 's'})`)
    writes.push([`${rel}.upgrade-merge`, r.stdout])
  }
}
for (const rel of deletedPaths()) {
  const file = path.join(PROJECT, rel)
  if (!existsSync(file)) continue
  if (history(rel).has(hashFile(file))) {
    report.remove.push(rel)
    deletes.push(rel)
  } else report.keep.push(`${rel} (the template deleted it, but this copy is customized)`)
}
rmSync(tmp, { recursive: true, force: true })

// The article's own source files that import a package.
function importers(pkg) {
  const dir = path.join(PROJECT, 'src')
  if (!existsSync(dir)) return []
  const re = new RegExp(`from\\s+['"]${pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(/[^'"]*)?['"]`)
  return walk(dir, PROJECT).filter((rel) => /\.(tsx?|jsx?)$/.test(rel) && !isInfra(rel) && re.test(readFileSync(path.join(PROJECT, rel), 'utf8')))
}

// package.json: key-level merge of dependencies, devDependencies, scripts.
const pkgNotes = []
{
  const file = path.join(PROJECT, 'package.json')
  const mine = JSON.parse(readFileSync(file, 'utf8'))
  const theirs = JSON.parse(readFileSync(path.join(TEMPLATE, 'package.json'), 'utf8'))
  const past = [...history('package.json')].map((sha) => {
    try {
      return JSON.parse(blobText(sha))
    } catch {
      return {}
    }
  })
  let changed = false
  for (const sec of ['dependencies', 'devDependencies', 'scripts']) {
    const m = (mine[sec] ??= {})
    const t = theirs[sec] ?? {}
    const was = (k) => past.some((p) => p[sec]?.[k] === m[k])
    for (const [k, v] of Object.entries(t)) {
      if (m[k] === v) continue
      if (m[k] === undefined || was(k)) {
        pkgNotes.push(`${sec}.${k}: ${m[k] ?? '(none)'} → ${v}`)
        m[k] = v
        changed = true
      } else pkgNotes.push(`${sec}.${k}: kept ${m[k]} (template has ${v})`)
    }
    for (const k of Object.keys(m)) {
      if (k in t) continue
      if (past.some((p) => k in (p[sec] ?? {})) && was(k)) {
        const users = sec === 'scripts' ? [] : importers(k)
        if (users.length) {
          pkgNotes.push(`${sec}.${k}: kept (the template dropped it, but ${users.slice(0, 3).join(', ')} still import${users.length === 1 ? 's' : ''} it)`)
          continue
        }
        pkgNotes.push(`${sec}.${k}: removed (dropped from the template)`)
        delete m[k]
        changed = true
      }
    }
  }
  if (changed) writes.push(['package.json', JSON.stringify(mine, null, 2) + '\n'])
}

// Author data: pre-0.9 diagram saves.
const dataNotes = []
const figDir = path.join(PROJECT, 'content/figures')
if (existsSync(figDir)) {
  for (const name of readdirSync(figDir).filter((n) => n.endsWith('.json'))) {
    const rel = `content/figures/${name}`
    const d = JSON.parse(readFileSync(path.join(PROJECT, rel), 'utf8'))
    if (!d.layout && !d.viewport) continue
    const { layout, viewport, ...rest } = d
    const nodes = { ...Object.fromEntries(Object.entries(layout ?? {}).map(([k, p]) => [k, { x: p.x, y: p.y }])), ...rest.nodes }
    writes.push([rel, JSON.stringify({ ...rest, nodes }, null, 2) + '\n'])
    dataNotes.push(`${rel}: ${Object.keys(layout ?? {}).length} node positions kept${viewport ? `, viewport (zoom ${viewport.zoom}) dropped` : ''}`)
  }
}

// src/figures/registry.ts lists the article's figures, but its types are
// the template's, and template components read them.
const registryNotes = []
{
  const rel = 'src/figures/registry.ts'
  const file = path.join(PROJECT, rel)
  let text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const at = text.indexOf('export type FigureEntry = {')
  const end = at < 0 ? -1 : text.indexOf('\n}', at)
  if (end > 0 && !/export type ParamHint\b/.test(text)) {
    const hint = `// Explicit slider bounds for a numeric parameter in the knob panel.\nexport type ParamHint = {\n  min?: number\n  max?: number\n  step?: number\n}\n\n`
    const field = /\bparamHints\?:/.test(text.slice(at, end)) ? '' : `\n  // Optional per-parameter slider bounds (the figure's exported PARAM_HINTS).\n  paramHints?: Record<string, ParamHint>`
    text = text.slice(0, at) + hint + text.slice(at, end) + field + text.slice(end)
    writes.push([rel, text])
    registryNotes.push(`${rel}: added the ParamHint type and FigureEntry.paramHints (the knob panel reads them)`)
  }
}

// Figure code on the pre-0.9 DiagramFigure API.
const codeNotes = []
const srcFig = path.join(PROJECT, 'src/figures')
if (existsSync(srcFig)) {
  for (const rel of walk(srcFig, PROJECT).filter((r) => r.endsWith('.tsx') && !isInfra(r))) {
    const text = readFileSync(path.join(PROJECT, rel), 'utf8')
    if (/<DiagramFigure\b[^>]*\bnodes=/.test(text) || /DiagramNode\b/.test(text)) {
      codeNotes.push(`${rel}: pre-0.9 DiagramFigure props (nodes/edges/height). Renders through the compatibility layer; convert to a DiagramSpec (see STILL.md, Diagrams) to get kinds, groups, details and edge labels.`)
    }
  }
}

// ---- report / apply ------------------------------------------------------

const version = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')).version
const commit = git('rev-parse', '--short', 'HEAD').trim()
const section = (title, items) => items.length && console.log(`\n${title}\n${items.map((i) => `  ${i}`).join('\n')}`)

console.log(`${apply ? 'Upgrading' : 'Plan for'} ${PROJECT}\n  to moonshine ${version} (${commit})`)
if (!projectIsRepo) console.log('\nThis project is not a git repository, so the upgrade cannot be undone with git. Copy the folder first.')
section('Replace (unchanged copies of an older template):', report.update)
section('Merge (customized; merges cleanly):', report.merge)
section('Conflicts (written as <file>.upgrade-merge, not applied):', report.conflict)
section('Add (new in the template):', report.add)
section('Remove (dropped from the template, unchanged here):', report.remove)
section('Keep as is:', report.keep)
section('package.json:', pkgNotes)
section('Figure registry:', registryNotes)
section('Diagram data:', dataNotes)
section('Figure code to convert by hand:', codeNotes)
console.log(`\n${report.current.length} template files already current.`)

if (!apply) {
  console.log('\nNothing written. Re-run with --apply to make these changes.')
  process.exit(0)
}
if (projectIsRepo) {
  const untracked = execFileSync('git', ['-C', PROJECT, 'ls-files', '--others', '--exclude-standard', '--', '.'], { encoding: 'utf8' })
  const set = new Set(untracked.split('\n').filter(Boolean))
  const hit = [...writes.map(([rel]) => rel), ...deletes].filter((rel) => set.has(rel))
  if (hit.length) {
    console.error(`\nThese files are not committed and would be overwritten. Commit them first:\n${hit.map((h) => `  ${h}`).join('\n')}`)
    process.exit(1)
  }
}
for (const [rel, text] of writes) {
  const file = path.join(PROJECT, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}
for (const rel of deletes) rmSync(path.join(PROJECT, rel))
writeFileSync(
  path.join(PROJECT, '.moonshine-template.json'),
  JSON.stringify({ version, commit, upgraded: new Date().toISOString() }, null, 2) + '\n',
)
console.log(`\nDone. Next: npm install && npm run build${report.conflict.length ? ', then resolve the .upgrade-merge files' : ''}.`)
