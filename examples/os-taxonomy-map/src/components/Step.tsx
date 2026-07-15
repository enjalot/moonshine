import type { ReactNode } from 'react'

// A single scrollytelling card (`:::step`). Its inner content is ordinary
// markdown, rendered through the same component map as body prose, so each
// paragraph is Cmd/Ctrl+click editable in dev. ScrollyTour wraps this in
// the observed `.tour-step` element that drives the camera — Step itself
// just carries the card styling.
export default function Step({ children }: { children?: ReactNode }) {
  return <div className="step-text">{children}</div>
}
