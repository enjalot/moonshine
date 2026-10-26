import DiagramFigure from './DiagramFigure'
import type { FigureProps } from './registry'

// Built-in figure kind for diagrams the author adds in the browser:
// `:::figure{id=diagram-2 kind=diagram}` needs no registry entry and no
// figure file. Its spec and arrangement both live in
// content/figures/<id>.json, edited in the same diagram editor as every
// other diagram. An agent answering a comment on it edits that file's
// `spec`.

export default function AuthoredDiagram({ figureId }: FigureProps) {
  return <DiagramFigure figureId={figureId} authored />
}
