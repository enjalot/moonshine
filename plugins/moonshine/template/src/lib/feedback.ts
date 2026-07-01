// Client half of the authorship-feedback protocol (see
// plugins/moonshine/FEEDBACK.md). Thin typed wrappers over the dev-only
// /__moonshine/feedback endpoints — no React, no harness knowledge. The
// HUD and comment box drive these; an agent harness drains the files this
// produces on the other side.
//
// These functions are only ever called from dev-only UI. In a production
// `vite build` the endpoints don't exist, but the calls are also never
// reached because their callers are gated on EDIT_ENABLED.

import { EDIT_ENABLED } from './EditContext'

const BASE = '/__moonshine/feedback'

// The protocol defines five kinds. `block` and `figure` are the two the UI
// currently produces (the 💬 affordance on a prose block's source editor and a
// figure's knob panel). `caption`, `term`, and `selection` are reserved in the
// ABI for future affordances — the endpoint still accepts them so an adapter or
// a later UI can use them without a protocol bump — but nothing emits them yet.
export type CommentKind = 'block' | 'figure' | 'caption' | 'term' | 'selection'

export type CommentTarget = {
  kind: CommentKind
  path: string
  range?: [number, number]
  figureId?: string
  termRef?: string
  excerpt?: string
  anchorHash?: string
}

export type CommentStatus = 'pending' | 'delivered' | 'addressed' | 'dismissed'

export type Comment = {
  id: string
  ts: string
  status: CommentStatus
  target: CommentTarget
  comment: string
  reply: string | null
}

export type ListenMode = 'listen' | 'paused' | 'stopped'

export type Capabilities = {
  // Whether the feedback subsystem is enabled at all (flag on + routes live).
  enabled: boolean
  // The installed adapter's harness id, or null if none is connected.
  harness: string | null
  // True when a listener is actively heartbeating (regardless of paused).
  alive: boolean
  // The listener's current mode if alive, else null.
  mode: ListenMode | null
  project: string | null
}

export const DISABLED_CAPABILITIES: Capabilities = {
  enabled: false,
  harness: null,
  alive: false,
  mode: null,
  project: null,
}

async function postJSON(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let detail = raw
    try {
      detail = (JSON.parse(raw) as { error?: string }).error ?? raw
    } catch {
      // not JSON
    }
    throw new Error(detail || `request failed (${res.status})`)
  }
}

// Capabilities is the one call that must never throw: a 404 (flag off, routes
// absent) or a network error simply means "feedback unavailable" and the HUD
// degrades to not rendering.
export async function fetchCapabilities(): Promise<Capabilities> {
  // Hard build-time gate, same discipline as postSave: esbuild folds
  // EDIT_ENABLED to `false` in a production build, so everything below —
  // including the endpoint strings — is dead-code-eliminated.
  if (!EDIT_ENABLED) return DISABLED_CAPABILITIES
  try {
    const res = await fetch(`${BASE}/capabilities`)
    if (!res.ok) return DISABLED_CAPABILITIES
    const data = (await res.json()) as Partial<Capabilities>
    return { ...DISABLED_CAPABILITIES, ...data, enabled: data.enabled !== false }
  } catch {
    return DISABLED_CAPABILITIES
  }
}

export async function fetchComments(): Promise<Comment[]> {
  if (!EDIT_ENABLED) return []
  try {
    const res = await fetch(BASE)
    if (!res.ok) return []
    const data = (await res.json()) as { comments?: Comment[] }
    return data.comments ?? []
  } catch {
    return []
  }
}

export async function postComment(target: CommentTarget, comment: string): Promise<void> {
  if (!EDIT_ENABLED) return
  await postJSON('', { target, comment })
}

export async function postControl(mode: ListenMode): Promise<void> {
  if (!EDIT_ENABLED) return
  await postJSON('/control', { mode })
}

export async function dismissComment(id: string): Promise<void> {
  if (!EDIT_ENABLED) return
  await postJSON('/dismiss', { id })
}
