import type { FigureProps } from './registry'
import DiagramFigure, { type DiagramSpec } from './DiagramFigure'

// The diagrams on the "Diagrams" page (content/diagrams.md): one small
// spec per thing the built-in diagram can draw. Each is an ordinary
// DiagramSpec, laid out automatically until someone arranges it with
// "edit diagram". Copy the one nearest to what you need.

// Nodes alone: the pieces, each with its icon and name, before any figure
// connects them.
const VOCABULARY: DiagramSpec = {
  nodes: [
    { id: 'person', label: 'Person', icon: 'person' },
    { id: 'service', label: 'Service', icon: 'service', tone: 'flow' },
    { id: 'function', label: 'Function', icon: 'function', tone: 'flow' },
    { id: 'database', label: 'Database', icon: 'database', tone: 'data' },
    { id: 'queue', label: 'Queue', icon: 'queue', tone: 'data' },
    { id: 'store', label: 'File store', icon: 'store', tone: 'data' },
    { id: 'schedule', label: 'Schedule', icon: 'clock', tone: 'control' },
    { id: 'key', label: 'Secret', icon: 'key', tone: 'access' },
  ],
  edges: [],
}

// A system: tiles in zones, links coloured by what they carry.
const SYSTEM: DiagramSpec = {
  direction: 'RIGHT',
  groups: [
    { id: 'shop', label: 'Shop account', style: 'corners' },
    { id: 'partner', label: 'Print partner', style: 'corners', tone: 'control' },
  ],
  nodes: [
    { id: 'customer', label: 'Customer', icon: 'person' },
    { id: 'storefront', label: 'Storefront', icon: 'browser', tone: 'flow', group: 'shop' },
    { id: 'orders', label: 'Orders', icon: 'database', tone: 'data', group: 'shop' },
    { id: 'jobs', label: 'Print jobs', icon: 'queue', tone: 'data', group: 'shop' },
    { id: 'renderer', label: 'Renderer', icon: 'service', tone: 'flow', group: 'partner', badge: '4', detail: 'Four workers take jobs one at a time.' },
    { id: 'proof', label: 'Proof check', icon: 'function', group: 'partner', dashed: true },
  ],
  edges: [
    { from: 'customer', to: 'storefront', label: 'orders', family: 'flow' },
    { from: 'storefront', to: 'orders', label: 'reads, writes', family: 'data', arrows: 'both' },
    { from: 'storefront', to: 'jobs', label: 'queues', family: 'flow' },
    { from: 'jobs', to: 'renderer', label: 'one at a time', family: 'flow' },
    { from: 'renderer', to: 'proof', label: 'checks', dashed: true },
  ],
}

// Labelled boxes: for nodes that are sentences, decisions or formulas.
const BOXES: DiagramSpec = {
  direction: 'DOWN',
  nodes: [
    { id: 'request', label: 'Refund request', kind: 'data' },
    { id: 'small', label: 'Under $50?', kind: 'decision' },
    { id: 'auto', label: 'Refund at once', kind: 'accent' },
    { id: 'review', label: 'A person reviews it' },
    { id: 'ledger', label: 'Ledger', kind: 'store' },
    { id: 'bank', label: 'Bank', kind: 'external' },
    { id: 'policy', label: 'Limit set by policy,\nreviewed yearly', kind: 'note' },
  ],
  edges: [
    { from: 'request', to: 'small' },
    { from: 'small', to: 'auto', label: 'yes' },
    { from: 'small', to: 'review', label: 'no' },
    { from: 'auto', to: 'ledger' },
    { from: 'review', to: 'ledger', label: 'if approved', dashed: true },
    { from: 'ledger', to: 'bank', label: 'nightly', animated: true },
  ],
}

// Any emoji, and any Tabler icon, as the glyph.
const ANY_ICON: DiagramSpec = {
  direction: 'RIGHT',
  nodes: [
    { id: 'grain', label: 'Grain', icon: '🌾' },
    { id: 'mash', label: 'Mash', icon: 'tabler:droplet', tone: 'data' },
    { id: 'still', label: 'Still', icon: 'tabler:flame', tone: 'control' },
    { id: 'barrel', label: 'Barrel', icon: '🛢️' },
    { id: 'bottle', label: 'Bottle', icon: 'tabler:bottle', tone: 'flow' },
    { id: 'taster', label: 'Taster', icon: '👩‍🔬', labelSide: 'right' },
  ],
  edges: [
    { from: 'grain', to: 'mash', label: 'soak' },
    { from: 'mash', to: 'still', label: 'heat' },
    { from: 'still', to: 'barrel', label: 'condense' },
    { from: 'barrel', to: 'bottle', label: 'two years' },
    { from: 'taster', to: 'barrel', label: 'samples', dashed: true },
  ],
}

// What a link can say: one way, both ways, no direction; solid or dashed;
// a colour family for what it carries.
const LINKS: DiagramSpec = {
  direction: 'RIGHT',
  nodes: [
    { id: 'a1', label: 'Editor', icon: 'person' },
    { id: 'b1', label: 'Draft', icon: 'document', tone: 'data' },
    { id: 'a2', label: 'App', icon: 'browser', tone: 'flow' },
    { id: 'b2', label: 'Cache', icon: 'store', tone: 'data' },
    { id: 'a3', label: 'Primary', icon: 'database', tone: 'data' },
    { id: 'b3', label: 'Replica', icon: 'database', tone: 'data' },
    { id: 'a4', label: 'Deploy job', icon: 'gear', tone: 'control' },
    { id: 'b4', label: 'Signing key', icon: 'key', tone: 'access' },
  ],
  edges: [
    { from: 'a1', to: 'b1', label: 'writes', family: 'flow' },
    { from: 'a2', to: 'b2', label: 'reads, writes', family: 'data', arrows: 'both' },
    { from: 'a3', to: 'b3', label: 'same region', arrows: 'none' },
    { from: 'a4', to: 'b4', label: 'may use', family: 'access', dashed: true },
  ],
}

// The four ways to draw a boundary, each with its own colour.
const ZONES: DiagramSpec = {
  direction: 'RIGHT',
  groups: [
    { id: 'outline', label: 'Outline' },
    { id: 'corners', label: 'Corner marks', style: 'corners', tone: 'flow' },
    { id: 'tint', label: 'Tinted area', style: 'tint', tone: 'data' },
    { id: 'dashed', label: 'Dashed: planned', style: 'dashed', tone: 'control' },
  ],
  nodes: [
    { id: 'z1', label: 'Web', icon: 'browser', group: 'outline' },
    { id: 'z2', label: 'API', icon: 'service', tone: 'flow', group: 'corners' },
    { id: 'z3', label: 'Orders', icon: 'database', tone: 'data', group: 'tint' },
    { id: 'z4', label: 'Archive', icon: 'folder', tone: 'control', group: 'dashed', dashed: true },
  ],
  edges: [
    { from: 'z1', to: 'z2', family: 'flow' },
    { from: 'z2', to: 'z3', family: 'data', arrows: 'both' },
    { from: 'z3', to: 'z4', label: 'yearly', dashed: true },
  ],
}

const make = (spec: DiagramSpec) =>
  function GalleryDiagram({ figureId }: FigureProps) {
    return <DiagramFigure figureId={figureId} spec={spec} />
  }

export const DiagramVocabulary = make(VOCABULARY)
export const DiagramSystem = make(SYSTEM)
export const DiagramBoxes = make(BOXES)
export const DiagramAnyIcon = make(ANY_ICON)
export const DiagramLinks = make(LINKS)
export const DiagramZones = make(ZONES)
