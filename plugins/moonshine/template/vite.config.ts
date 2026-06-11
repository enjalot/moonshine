import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import moonshineEditPlugin from './vite-plugin-moonshine-edit'

export default defineConfig({
  // moonshineEditPlugin self-restricts to `apply: 'serve'`, so the
  // write-back endpoint exists only during `npm run dev`, never in a
  // production `vite build`.
  plugins: [react(), moonshineEditPlugin()],
  resolve: {
    alias: {
      '#content': path.resolve(__dirname, './.velite'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    open: false,
    // MOONSHINE_PORT lets a second project (e.g. the in-repo template
    // dev harness) coexist with an article already running on 5173.
    port: Number(process.env.MOONSHINE_PORT) || 5173,
    // Fail loudly if the port is taken instead of silently picking a
    // different one. The /moonshine:still command parses the actual
    // URL from Vite's stdout, but a hard failure here surfaces the
    // collision so the user can decide what to kill.
    strictPort: true,
    // `npm run dev:lan` passes --host 0.0.0.0 (the CLI flag overrides
    // config) for browsing from other devices. Vite blocks unknown Host
    // headers as a DNS-rebinding mitigation; `.local` admits mDNS
    // hostnames like http://my-machine.local:5173.
    allowedHosts: ['.local'],
  },
})
