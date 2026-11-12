# Draggable figures: declarative dragging

Figures that readers drag are built with [Dragology](https://declarative-dragging.github.io)
(`dragology`, pinned in package.json). Instead of writing pointer handlers,
a figure says, for each draggable element, which **states** dragging it
can lead to. Dragology draws those states, finds where the element would
be in each, and works out the motion, the snapping and the drop animation.

```tsx
import { param, inOrder, translate, type Draggable } from 'dragology'
import DragFigure from './drag/DragFigure'

type State = { x: number }

const draw: Draggable<State> = ({ state, d }) => (
  <g>
    <line x1={20} x2={460} y1={60} y2={60} stroke="var(--text-2)" />
    <circle
      id="knob"
      transform={translate(state.x, 60)}
      r={9}
      fill="var(--accent)"
      dragologyOnDrag={() => d.vary(state, param('x'), { constraint: (s) => inOrder([20, s.x, 460]) })}
    />
  </g>
)

export default function Slider() {
  return <DragFigure draggable={draw} width={480} height={120} initialState={{ x: 100 }} label="A slider" />
}
```

## The pieces here

- **`DragFigure`**: the frame for a draggable figure. You draw in your
  own coordinate space (`width` × `height`, like a viewBox), and it scales
  to the column. Pass `initialState`, or `state` + `onState` when the
  figure's parameters (DEFAULTS, the knob panel) should drive it.
- **`Renderer`**: Dragology's `DraggableRenderer` with moonshine's fixes
  (the body cursor is restored after a drag; a drawing that throws only
  takes down its own figure). Use it instead of `DraggableRenderer` when
  you don't want DragFigure's sizing (the diagram editor, block reorder).
- **`each(items, fn)`**: map a list inside a drawing. Dragology forbids
  React `key`s, and React 18 warns without them; `each` satisfies both.

## Patterns

| want | spec |
| --- | --- |
| a slider, a free point | `d.vary(state, [param('x'), param('y')], { constraint })` |
| a toggle, a 3-way switch | `d.between([{ on: false }, { on: true }])` |
| snap to one of a few states | `d.closest(states)` |
| detents on a slider | `d.closest(detentStates).whenFar(d.vary(state, param('x')), { gap: 10 })` |
| reorder a list | `d.closest(allOrders).withFloating()` |
| drop onto a target | `d.closest(targets.map((t) => d.dropTarget(t.id, stateWith(t)))).withFloating().whenFar(state)` |
| change something as you drag | `d.vary(...).during((s) => adjust(s))` (snap, regroup) |
| drop somewhere else than shown | `.onDrop(state)` or `.onDrop((preview) => next)` |
| bouncy | `.withDropTransition('elastic-out')` |

Two ideas make figures better than "move the dot":

- **Drag an output, not an input.** `d.vary` searches for parameter
  values that put the *dragged element* under the pointer, whatever the
  element is. Drag a point partway along a computed path, and Dragology
  finds the start that makes the path run through the pointer
  (`LossLandscape.tsx`); drag where a step lands, and the step size
  follows (`StepSize.tsx`). The reader manipulates the thing the prose
  is about.
- **Let the states be the meaning.** A slider with detents at the
  article's interesting values (`StepSize.tsx`: the four step sizes in
  the table), a list whose orders are the candidates, arrows whose ends
  can only land on real sides of real boxes (the diagram editor). Say
  the states that make sense, and the interaction can't reach nonsense.

## Rules (Dragology's, and ours)

- **Position with `transform`** (`translate(x, y)`), never `x`/`y`/`cx`:
  Dragology tracks elements through transforms.
- **Draggable elements need an `id`**, unique on the whole page (scope
  them per instance: `const uid = useId().replace(/:/g, '')`). No `/` in
  ids. Never `key`: use `each()`.
- **No fragments** (`<>`): group with `<g>`.
- **Never vary a string prop between states.** Dragology blends every
  prop of two drawings and throws on two different strings. That is
  `className`, and equally `aria-label`, `textAnchor`, `dy="1em"` or a
  colour name. Put what varies in `data-*` attributes (not blended) and
  style with `[data-on~='active']`. Text content may differ.
- **Clicks inside a draggable** (a button on a card) only work if the
  draggable element itself has an `onClick` (even `() => undefined`):
  only then does Dragology wait to see whether a press becomes a drag.
  Otherwise the drag starts at once and the click is lost.
- **Children that come and go get `dragologyKey`** (or an id), so the
  others still pair up across states.
- **`isTracking`**: Dragology sometimes draws a state only to find where
  the dragged element lands. Skip expensive, unrelated drawing then
  (`LossLandscape` skips its heatmap).
- **HTML goes in a component inside `<foreignObject>`**; Dragology
  treats it as opaque.
- Colors from the tokens (`var(--accent)`), so figures follow dark mode.
  Pixels baked outside CSS (a canvas image) need one version per scheme:
  see `lib/useDark.ts` and how `LossLandscape` keys its heatmap.
- **Text is `font-size: var(--mn-fig-text)`.** `DragFigure` scales the
  drawing to the column, and that variable divides by the scale, so text
  renders at 13px at every width. On a phone the labels are therefore
  larger relative to the drawing: offset them in `em` (`dy="1.7em"`),
  stagger neighbours onto two rows, and check the figure at 360px.
  `StepSize` shows the pattern.
- **Give small handles a finger-sized target**: a transparent circle of
  about 24 units around the visible mark, inside the draggable group.
- **Dragging is pointer-only.** When the argument depends on the drag,
  give the same state a keyboard path (a focusable control or arrow keys
  that call `onState`) and say so in the hint.
- Every draggable figure still needs a `label` (what it shows) and a
  one-line `figure-hint` saying what can be dragged.

`node_modules/dragology/AGENTS.md` is the full API for the pinned
version. The website and Dragology's GitHub describe newer features
(`withOverlay`, `draggableLine`, `dragologyLerpProps`) that 0.1.7 lacks.
