import { Children, type ReactNode } from 'react'

// Lists inside a Dragology drawing. Dragology matches elements across
// states by `id` and rejects React `key`s, but React 18 still warns about
// a keyless array. Children.toArray gives each item an index key of the
// form Dragology allows (".0", ".1", …), so map lists through this:
//
//   {each(points, (p) => <circle id={`pt-${p.id}`} … />)}
export function each<T>(items: readonly T[], draw: (item: T, i: number) => ReactNode): ReactNode[] {
  return Children.toArray(items.map(draw))
}
