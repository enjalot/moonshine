import type { FigureProps } from './registry'
import DiagramFigure, { type DiagramSpec } from './DiagramFigure'

// A system diagram in the tile style: each node is an icon for the KIND of
// thing it is, with its name outside the tile; links are coloured by what
// they carry and their labels say which way it goes.
//
// Still an ordinary DiagramSpec. The author arranges it with "edit
// diagram" like any other, and can change icons, label sides, colours and
// arrow directions there. See skills/diagram/SKILL.md for when a diagram
// should look like this and when labelled boxes are the better form.

const SPEC: DiagramSpec = {
  direction: 'RIGHT',
  groups: [{ id: 'job', label: 'Training job' }],
  nodes: [
    { id: 'dataset', label: 'Dataset', icon: 'database', tone: 'data' },
    { id: 'trainer', label: 'Trainer', icon: 'service', tone: 'flow', group: 'job', badge: '4' },
    { id: 'schedule', label: 'Step-size schedule', icon: 'clock', tone: 'control', group: 'job' },
    { id: 'checkpoints', label: 'Checkpoints', icon: 'store', tone: 'data' },
    { id: 'author', label: 'You', icon: 'person' },
  ],
  edges: [
    { from: 'dataset', to: 'trainer', label: 'batches', family: 'data' },
    { from: 'schedule', to: 'trainer', label: 'η', family: 'control' },
    { from: 'trainer', to: 'checkpoints', label: 'reads, writes', family: 'data', arrows: 'both' },
    { from: 'author', to: 'schedule', label: 'tunes', family: 'control' },
  ],
}

export default function TrainingSystem({ figureId }: FigureProps) {
  return <DiagramFigure figureId={figureId} spec={SPEC} />
}
