import { inlineFigures } from '../figures/registry'

type Props = {
  kind?: string
  children?: React.ReactNode
  [key: string]: unknown
}

// Inline-block visual that appears mid-paragraph. Directive form
// (single-colon text directive, no [label]):
//   :inline-viz{kind=mini-spark value=0.8}
// `kind` selects the component from the inline registry. All other
// attributes pass through as props.
export default function InlineViz({ kind, children: _children, ...rest }: Props) {
  if (!kind) {
    return <span className="inline-viz inline-viz-missing">?</span>
  }
  const Component = inlineFigures[kind]
  if (!Component) {
    return (
      <span className="inline-viz inline-viz-missing" title={`unknown kind: ${kind}`}>
        ?{kind}
      </span>
    )
  }
  return (
    <span className="inline-viz">
      <Component {...(rest as Record<string, unknown>)} />
    </span>
  )
}
