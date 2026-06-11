// Coercion helpers for figure parameters. Directive attributes arrive
// from markdown as strings (`:::figure{id=x lr=0.15}` → lr: "0.15"), so
// figures parse them against their DEFAULTS with these helpers. Invalid
// or missing values fall back rather than producing NaN renders.

export function num(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN
  return Number.isFinite(n) ? n : fallback
}

export function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
