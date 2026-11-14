import { Component, useCallback, useRef, type ReactNode } from 'react'
import { DraggableRenderer, type DraggableRendererProps, type DragStatus } from 'dragology'

// Dragology's renderer, as moonshine uses it. Two additions:
//
// - Dragology sets document.body.style.cursor to "grabbing" during a drag
//   and to "default" after, and an inline body cursor of "default" takes
//   the text I-beam away from the whole article. Once a drag is over, the
//   inline style is cleared again.
// - A drawing that throws (Dragology asserts loudly, e.g. when two states
//   can't be blended) takes down only its own figure, not the article.
//
// Use this, not DraggableRenderer, everywhere.
export default function DragRenderer<T extends object>(props: DraggableRendererProps<T>) {
  const outer = useRef(props.onDragStatus)
  outer.current = props.onDragStatus
  const onDragStatus = useCallback((s: DragStatus<T>) => {
    outer.current?.(s)
    // Dragology's own cursor effect runs after this callback's.
    if (s.type === 'idle') {
      requestAnimationFrame(() => {
        if (document.body.style.cursor === 'default') document.body.style.removeProperty('cursor')
      })
    }
  }, [])
  return (
    <Contain>
      <DraggableRenderer {...props} onDragStatus={onDragStatus} />
    </Contain>
  )
}

class Contain extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('moonshine: a draggable drawing failed', error)
    document.body.style.removeProperty('cursor')
  }
  render() {
    if (!this.state.error) return this.props.children
    return import.meta.env.DEV ? (
      <p className="mn-drag-error">
        This drawing hit an error: {this.state.error.message}{' '}
        <button type="button" onClick={() => this.setState({ error: null })}>
          retry
        </button>
      </p>
    ) : null
  }
}
