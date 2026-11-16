// Touch editing (dev only): touch and hold stands in for holding ⌘/Ctrl.
//
// With a keyboard, the author holds ⌘/Ctrl and clicks a block to edit it,
// or drags it to reorder. A finger has no modifier key, so:
//
//   touch and hold a block, then lift   = ⌘/Ctrl+click (edit the prose,
//                                         or open a figure's parameters)
//   touch and hold, then drag           = ⌘/Ctrl+drag (reorder the block)
//
// The hold "arms" the page exactly as the modifier does (the block outlines
// appear), so the author sees the moment it takes. Lifting sends the same
// click the keyboard path sends, with `metaKey` set, to whatever was under
// the finger; every existing ⌘/Ctrl+click handler answers it unchanged.
// Dragging hands the press to BlockReorderLayer.
//
// A hold never starts on something the finger is already meant to operate:
// form controls, the edit chrome, an open editor, or a draggable part of a
// figure (anything whose touch-action is `none`).

const HOLD_MS = 450
// How far a finger may wander and still count as holding still.
const SLOP = 10

// True from the moment a hold takes until the finger lifts.
export const touchHold = { active: false }

// Whether this device's main pointer is a finger. Used for wording and
// sizing only; the gesture itself keys off each pointer's type, so a
// touch laptop gets both paths.
export const coarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches

const SKIP = 'input, textarea, select, button, label, summary, [contenteditable], .mn-chrome, .mn-edit, .mn-knobs, .mn-diagram-arrange, .mn-diagram-bar, .mn-figure-controls'

function holdable(target: Element): boolean {
  if (!target.closest('.article')) return false
  if (target.closest(SKIP)) return false
  // A draggable part of a figure: the finger is there to drag it.
  for (let el: Element | null = target; el && !el.classList.contains('article'); el = el.parentElement) {
    if (getComputedStyle(el).touchAction === 'none') return false
  }
  return true
}

type Press = { id: number; x: number; y: number; target: Element; timer: number; held: boolean; dragged: boolean; mark: Element | null }

export function installTouchHold(setArmed: (armed: boolean) => void): () => void {
  let press: Press | null = null
  // The events this module sends itself, so it does not answer them.
  const own = new WeakSet<Event>()
  const send = (target: Element, ev: Event) => {
    own.add(ev)
    target.dispatchEvent(ev)
  }
  // After a hold, the browser may still send its own click (or none);
  // ours is the one that counts.
  let swallowClickUntil = 0

  const end = () => {
    if (!press) return
    window.clearTimeout(press.timer)
    if (press.held) {
      touchHold.active = false
      setArmed(false)
      press.mark?.removeAttribute('data-held')
    }
    press = null
  }

  const onDown = (e: PointerEvent) => {
    if (own.has(e) || e.pointerType === 'mouse' || !e.isPrimary) return
    end()
    const target = e.target as Element | null
    if (!target || !holdable(target)) return
    const p: Press = { id: e.pointerId, x: e.clientX, y: e.clientY, target, held: false, dragged: false, timer: 0, mark: null }
    p.timer = window.setTimeout(() => {
      if (press !== p) return
      p.held = true
      touchHold.active = true
      setArmed(true)
      // Show which block the hold took (a finger has no hover to show it).
      p.mark = p.target.closest('.mn-block, .mn-editable-figure')
      p.mark?.setAttribute('data-held', '')
      // A long press also starts a text selection; ours replaces it.
      window.getSelection()?.removeAllRanges()
      navigator.vibrate?.(8)
      // Give BlockReorderLayer the press it would have seen under ⌘/Ctrl.
      send(
        p.target,
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: p.x,
          clientY: p.y,
          pointerId: p.id,
          pointerType: e.pointerType,
          isPrimary: true,
          button: 0,
          buttons: 1,
        }),
      )
    }, HOLD_MS)
    press = p
  }

  const onMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return
    const far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP
    if (!press.held) {
      // Moved before the hold took: a scroll or a swipe, not ours.
      if (far) end()
    } else if (far) press.dragged = true
  }

  const onUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return
    const p = press
    end()
    if (!p.held) return
    swallowClickUntil = performance.now() + 400
    if (p.dragged) return
    send(p.target, new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: p.x, clientY: p.y, metaKey: true }))
  }

  const onCancel = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) end()
  }

  // Once a hold has taken, the finger's movement is ours: without this the
  // page would scroll under a reorder drag.
  const onTouchMove = (e: TouchEvent) => {
    if (press?.held && e.cancelable) e.preventDefault()
  }

  // The browser's own long-press menu (Android) would cover the editor.
  const onContextMenu = (e: MouseEvent) => {
    if (press) e.preventDefault()
  }

  const onClick = (e: MouseEvent) => {
    if (!own.has(e) && performance.now() < swallowClickUntil) {
      swallowClickUntil = 0
      e.preventDefault()
      e.stopPropagation()
    }
  }

  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('pointermove', onMove, true)
  document.addEventListener('pointerup', onUp, true)
  document.addEventListener('pointercancel', onCancel, true)
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('click', onClick, true)
  return () => {
    end()
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('pointerup', onUp, true)
    document.removeEventListener('pointercancel', onCancel, true)
    document.removeEventListener('touchmove', onTouchMove, true)
    document.removeEventListener('contextmenu', onContextMenu, true)
    document.removeEventListener('click', onClick, true)
  }
}
