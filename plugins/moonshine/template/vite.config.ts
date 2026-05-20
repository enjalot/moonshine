import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '#content': path.resolve(__dirname, './.velite'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    open: false,
    port: 5173,
    // Fail loudly if 5173 is taken instead of silently picking a
    // different port. The /moonshine:still command parses the actual
    // URL from Vite's stdout, but a hard failure here surfaces the
    // collision so the user can decide what to kill.
    strictPort: true,
  },
})
