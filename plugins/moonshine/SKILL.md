---
name: moonshine
description: Help users create interactive explanations of technical concepts, inspired by Distill.pub
user_invocable: true
---

# Moonshine: Interactive Technical Explanations

Moonshine helps users create interactive, web-based explanations of technical concepts. Inspired by [Distill.pub](https://distill.pub)'s argument that research distillation is valuable creative work, moonshine provides scaffolding to turn complex ideas into explorable, visual, interactive articles.

AI tools generate complexity faster than people can consume it. Moonshine is for bridging that gap: helping people digest and communicate technical concepts clearly.

**Tech stack:** React 18 + Vite, D3 via [d3-power-tools](https://github.com/syntagmatic/d3-power-tools), TypeScript

## How to Use This Skill

**Do not skip to code.** The most common failure mode is jumping straight to scaffolding without understanding what the user is trying to explain and who they're explaining it to. Always start with story discovery.

When a user invokes moonshine, guide them through this process:

### 1. Clarify the Explanation (Story Discovery)

Before writing any code, have a conversation with the user. Ask questions and listen. You need to understand:

- **What concept are you explaining?** Get specific. Not "machine learning" but "how gradient descent finds minima."
- **Who is the audience?** What can they already be assumed to know? What's new to them?
- **What is the key insight?** What is the single thing the reader should walk away understanding?
- **What is the progression of understanding?** What does the reader need to learn first, second, third to arrive at the insight? Map the dependency chain of ideas.
- **What misconceptions exist?** What do people commonly get wrong, and how can interaction expose the correct mental model?

Ask these questions one or two at a time. Start with "What are you trying to explain?" and follow the thread. Wait for answers before moving on. If the user gives you all the context upfront, you can move faster, but if they give a brief prompt, slow down and ask. The quality of the explanation depends on how well you understand the concept and audience before you start building.

### 2. Design the Interaction

For each concept in the progression, decide what combination of:

- **Static prose** clear, concise writing with careful information hierarchy
- **Static diagrams** D3-rendered figures that encode data visually
- **Interactive explorations** sliders, hover states, click-to-reveal that let readers test their understanding
- **Linked visualizations** multiple views that update together, showing the same data from different angles
- **Scroll-driven narrative** content that transforms as the reader progresses
- **Animated transitions** smooth interpolation between states to show how things change

Every interaction should serve understanding. If a slider doesn't help the reader build intuition, remove it. Gratuitous interaction is worse than none.

### 3. Scaffold the Project

Create a new project with this structure:

```
project-name/
  package.json          # React 18 + Vite + D3 deps
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx            # Entry point
    App.tsx             # Article layout and scroll management
    styles/
      article.css       # Typography, layout, information hierarchy
      variables.css     # Design tokens (colors, spacing, type scale)
    components/
      Article.tsx        # Main article container with scroll context
      Section.tsx        # Content section with intersection observer
      Figure.tsx         # Figure container with caption and margin notes
      Prose.tsx          # Rich text block with proper typography
    interactive/         # Concept-specific interactive components
      (created per-explanation)
    hooks/
      useScrollProgress.ts   # Track reader position
      useIntersection.ts     # Intersection observer hook
      useLinkedState.ts      # Shared state across linked visualizations
    data/
      (datasets for visualizations)
```

### 4. Build Iteratively

Start with prose and static figures. Add interaction only where it genuinely helps. Test with the question: "Does this interaction help the reader build a mental model they couldn't get from text alone?"

## Editorial Tone

Moonshine articles should have clear and humble prose. We are helping people digest, not force-feeding them. Some guidelines:

- Avoid em dashes. Use commas, periods, or restructure the sentence.
- Don't oversell. Say "this can help" not "this is a game-changer." Say "an appropriate metaphor" not "a precise metaphor."
- State what things do, not how important they are. Let the reader decide the importance.
- Prefer short, direct sentences. If a paragraph feels like it's building to a dramatic reveal, flatten it.
- Use "tries to", "can", "helps" instead of absolute claims.

The writing should feel like a knowledgeable colleague explaining something at a whiteboard, not a keynote presentation.

## Core Design Principles

These principles come from [Distill.pub](https://distill.pub) and the broader tradition of explanatory writing:

### Information Hierarchy

- **Primary:** The key insight and its supporting argument
- **Secondary:** Context, definitions, related concepts
- **Tertiary:** Technical details, proofs, edge cases (often in margin notes or expandable sections)

Use typography, spacing, and visual weight to make this hierarchy clear. The reader should be able to tell what matters most at a glance.

### Visual Encoding

- Position and length are the most accurate visual channels. Use them for the most important data.
- Color should encode categories or highlight, not carry quantitative information alone.
- Redundant encoding (color + position) improves accessibility.
- Consistent visual language across all figures in an article.

### Typography for Technical Content

- Large, readable body text (18-20px)
- Generous line height (1.5-1.6)
- Constrained line length (60-75 characters)
- Clear heading hierarchy
- Monospace for code, math font for equations
- Margin notes over footnotes (keep the reader's eyes near the content)

### Interaction Patterns

| Pattern | Use When | Example |
|---------|----------|---------|
| Details-on-demand | Supplementary info would clutter the main narrative | Hover a data point to see its values |
| Explorable explanation | The concept involves a parameter space the reader should explore | Slider that changes a function's parameters and updates its plot |
| Linked views | The same data has multiple meaningful representations | Scatterplot + histogram that highlight the same subset |
| Scroll-driven narrative | The explanation has a natural sequence of reveals | Chart that builds up as the reader scrolls through the argument |
| Animated transition | Two states are meaningfully different and the path between them matters | Morphing between two chart types to show they represent the same data |

## Template: package.json

```json
{
  "name": "explanation-name",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "d3": "^7.9.0"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

## Template: Article CSS Foundation

```css
/* article.css */
:root {
  --article-width: 720px;
  --margin-width: 240px;
  --body-font: 'Source Serif 4', Georgia, serif;
  --heading-font: 'Source Sans 3', system-ui, sans-serif;
  --mono-font: 'Source Code Pro', monospace;
  --body-size: 1.125rem;     /* 18px */
  --line-height: 1.6;
  --color-text: #1a1a2e;
  --color-text-secondary: #4a4a6a;
  --color-accent: #2563eb;
  --color-bg: #fafafa;
  --color-figure-bg: #ffffff;
  --color-border: #e2e2e8;
  --spacing-unit: 0.5rem;
}

.article {
  max-width: var(--article-width);
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: var(--body-font);
  font-size: var(--body-size);
  line-height: var(--line-height);
  color: var(--color-text);
}

.article h1, .article h2, .article h3 {
  font-family: var(--heading-font);
  font-weight: 700;
  line-height: 1.2;
}

.article h1 { font-size: 2.25rem; margin: 3rem 0 1.5rem; }
.article h2 { font-size: 1.5rem; margin: 2.5rem 0 1rem; }
.article h3 { font-size: 1.25rem; margin: 2rem 0 0.75rem; }

.figure {
  margin: 2rem -2rem;
  padding: 1.5rem 2rem;
  background: var(--color-figure-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.figure-caption {
  font-family: var(--heading-font);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.75rem;
}

.margin-note {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}
```

## Template: Base App Component

```tsx
// App.tsx
import { useState, createContext, useContext } from 'react'
import './styles/article.css'

// Shared state context for linked visualizations
interface ArticleState {
  // Add concept-specific shared state here
  [key: string]: unknown
}

const ArticleContext = createContext<{
  state: ArticleState
  setState: (updates: Partial<ArticleState>) => void
}>({ state: {}, setState: () => {} })

export function useArticleState() {
  return useContext(ArticleContext)
}

export default function App() {
  const [state, setFullState] = useState<ArticleState>({})
  const setState = (updates: Partial<ArticleState>) =>
    setFullState(prev => ({ ...prev, ...updates }))

  return (
    <ArticleContext.Provider value={{ state, setState }}>
      <article className="article">
        <header>
          <h1>Title</h1>
          <p className="subtitle">A clear one-sentence description of what the reader will understand.</p>
        </header>

        {/* Sections go here, each a step in the progression of understanding */}

      </article>
    </ArticleContext.Provider>
  )
}
```

## D3 Integration Pattern

Use [d3-power-tools](https://github.com/syntagmatic/d3-power-tools) subskills for visualization work rather than writing ad-hoc D3 code. The collection includes specialized skills for linked views, brushing, motion, scales, responsive layout, and more.

For custom D3 visuals in React:

```tsx
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'

interface ChartProps {
  data: number[]
  width?: number
  height?: number
}

export function Chart({ data, width = 600, height = 300 }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // D3 rendering logic here
    // Use enter/update/exit or join pattern

  }, [data, width, height])

  return (
    <div className="figure">
      <svg ref={svgRef} width={width} height={height} />
    </div>
  )
}
```

Let React own the DOM. Use D3 for scales, layouts, generators, and transitions, but render SVG elements via JSX where practical. Fall back to D3 DOM manipulation only for complex animations or bindngs that are awkward in React.

## Dependencies

Moonshine works best alongside [d3-power-tools](https://github.com/syntagmatic/d3-power-tools). If the user doesn't have it installed, suggest they add it:

```
/plugin marketplace add syntagmatic/d3-power-tools
```

There is no formal dependency mechanism in the plugin system, so this is a recommendation, not a requirement. Moonshine can function without it, but the visualization output will be better with the specialized D3 skills available.

## Reference Skills

- **[d3-power-tools](https://github.com/syntagmatic/d3-power-tools)** Reusable D3 visualization patterns and components. Use these subskills for any D3 visualization work rather than writing ad-hoc D3 code.
- **grill-me** Approach to guided question-asking to help users clarify their thinking.
