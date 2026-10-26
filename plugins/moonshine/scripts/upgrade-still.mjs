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
//   src/figures/*.tsx        figures still calling DiagramFigure with the
//                            pre-0.9 `nodes`/`edges` props are reported.
//                            They keep rendering (DiagramFigure accepts the
//                            old props) until converted to a DiagramSpec.
//
// Article content, figures, registry and config are never touched. Run it
// on a clean working tree; --apply refuses otherwise when the project is a
// git repo. Afterwards: npm install, npm run build, look at the diagrams.

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
  const dirty = execFileSync('git', ['-C', PROJECT, 'status', '--porcelain', '--', '.'], { encoding: 'utf8' }).trim()
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
  if (r.status === 0) {
    report.merge.push(rel)
    writes.push([rel, r.stdout])
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
section('Replace (unchanged copies of an older template):', report.update)
section('Merge (customized; merges cleanly):', report.merge)
section('Conflicts (written as <file>.upgrade-merge, not applied):', report.conflict)
section('Add (new in the template):', report.add)
section('Remove (dropped from the template, unchanged here):', report.remove)
section('Keep as is:', report.keep)
section('package.json:', pkgNotes)
section('Diagram data:', dataNotes)
section('Figure code to convert by hand:', codeNotes)
console.log(`\n${report.current.length} template files already current.`)

if (!apply) {
  console.log('\nNothing written. Re-run with --apply to make these changes.')
  process.exit(0)
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
