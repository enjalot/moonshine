import { useSyncExternalStore } from 'react'

// Whether the reader's colour scheme is dark. SVG and HTML follow the
// scheme through CSS custom properties with no code; this hook is for
// what can't: canvas pixels, WebGL uniforms, an image baked once.
// Key any cache of rendered colours by this value.

const query = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)')

export function useDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      query?.addEventListener('change', onChange)
      return () => query?.removeEventListener('change', onChange)
    },
    () => query?.matches ?? false,
    () => false,
  )
}

// Read a palette token for canvas or WebGL, which can't use var(--x).
// Call it inside the draw, after the scheme is known, not at module load.
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
