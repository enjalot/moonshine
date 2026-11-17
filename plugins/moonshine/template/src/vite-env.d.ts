/// <reference types="vite/client" />

declare module 'virtual:moonshine-icons' {
  const icons: Record<string, string[]>
  export default icons
}

// Diagram layouts made by `npm run build` (vite-plugin-moonshine-layouts.ts).
declare module 'virtual:moonshine-layouts' {
  const layouts: Record<string, import('./figures/diagram/bake').Prebuilt>
  export default layouts
}
