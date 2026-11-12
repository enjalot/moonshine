// Client half of suggestions: proposed changes an agent leaves for the author
// to accept, edit or reject in the page (see plugins/moonshine/FEEDBACK.md
// § Suggestions). The mirror image of comments: comments go author → agent,
// suggestions go agent → author. Dev-only, like the rest of the edit chrome.

import { EDIT_ENABLED } from './EditContext'

const BASE = '/__moonshine/suggestions'

export type SuggestionStatus = 'open' | 'accepted' | 'rejected'

export type Suggestion = {
  id: string
  ts: string
  status: SuggestionStatus
  // Content-relative path of the markdown file, e.g. `example.md`.
  path: string
  // Exact source text the suggestion is about.
  find: string
  // Proposed replacement. Absent → a remark with nothing to apply (the author
  // can still edit the passage or dismiss the remark). Empty string → delete.
  replace?: string
  // One or two sentences: why.
  note?: string
  // Who made it: "critique", "editing pass", an agent name.
  source?: string
  // Body offset of `find` when written; disambiguates repeated text.
  at?: number
  resolvedAt?: string | null
  appliedText?: string
}

export async function fetchSuggestions(): Promise<Suggestion[]> {
  if (!EDIT_ENABLED) return []
  try {
    const res = await fetch(BASE)
    if (!res.ok) return []
    const data = (await res.json()) as { suggestions?: Suggestion[] }
    return (data.suggestions ?? []).map((s) => ({ ...s, status: s.status ?? 'open' }))
  } catch {
    return []
  }
}

export async function resolveSuggestion(
  id: string,
  status: SuggestionStatus,
  appliedText?: string,
): Promise<void> {
  if (!EDIT_ENABLED) return
  const res = await fetch(`${BASE}/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, status, appliedText }),
  })
  if (!res.ok) throw new Error(`could not record the decision (${res.status})`)
}

// Where the suggestion's `find` text sits in the current body: the occurrence
// nearest the offset recorded when it was written. Null when the text is gone
// (the passage was edited since) — the suggestion is then stale.
export function locate(s: Suggestion, body: string): [number, number] | null {
  if (!s.find) return null
  if (typeof s.at === 'number' && body.startsWith(s.find, s.at)) {
    return [s.at, s.at + s.find.length]
  }
  let best = -1
  let bestDistance = Infinity
  let from = 0
  for (;;) {
    const i = body.indexOf(s.find, from)
    if (i === -1) break
    const d = typeof s.at === 'number' ? Math.abs(i - s.at) : i
    if (d < bestDistance) {
      best = i
      bestDistance = d
    }
    from = i + Math.max(1, s.find.length)
  }
  return best === -1 ? null : [best, best + s.find.length]
}

export type DiffPart = { kind: 'same' | 'del' | 'ins'; text: string }

// Word-level diff (LCS over whitespace-delimited tokens, whitespace kept with
// the token it follows). Suggestions are sentence- to paragraph-sized, so the
// quadratic table is small.
export function wordDiff(rawA: string, rawB: string): DiffPart[] {
  // Markdown prose is hard-wrapped, and a rewrite re-wraps it. Unless either
  // side has line-structured markdown (tables, lists, quotes, headings, code,
  // directives), fold single line breaks into spaces so the diff shows the
  // words that changed, without the wrap points.
  const structured = /^\s*([|>#:`]|[-*+] |\d+\. )/m
  const fold = (t: string) =>
    t
      .split(/\n[ \t]*\n/)
      .map((para) => para.replace(/\s+/g, ' '))
      .join('\n\n')
  const prose = !structured.test(rawA) && !structured.test(rawB)
  const a = prose ? fold(rawA) : rawA
  const b = prose ? fold(rawB) : rawB
  const ta = a.match(/\s*\S+\s*|\s+/g) ?? []
  const tb = b.match(/\s*\S+\s*|\s+/g) ?? []
  const n = ta.length
  const m = tb.length
  if (n * m > 400_000) {
    return [
      { kind: 'del', text: a },
      { kind: 'ins', text: b },
    ]
  }
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = ta[i] === tb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      push('same', ta[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('del', ta[i++])
    } else {
      push('ins', tb[j++])
    }
  }
  while (i < n) push('del', ta[i++])
  while (j < m) push('ins', tb[j++])
  return out
}
