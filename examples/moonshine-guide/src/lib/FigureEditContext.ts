import { createContext, useContext } from 'react'

// Dev-only: what a figure component can do to its own block in the
// markdown. Provided by Figure.tsx in dev, null in production, so a
// figure (DiagramFigure's bar, its editor) can offer these in place.
export type FigureEdit = {
  id: string
  // Breaks out of the text column (.figure-wide): the `wide` attribute
  // on the directive, else the registry entry's default.
  wide: boolean
  setWide: (on: boolean) => Promise<void>
  // Remove the figure's block from the markdown (after a confirm).
  remove: () => Promise<void>
}

export const FigureEditContext = createContext<FigureEdit | null>(null)

export const useFigureEdit = () => useContext(FigureEditContext)
