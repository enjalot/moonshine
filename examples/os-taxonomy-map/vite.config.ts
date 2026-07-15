import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import moonshineEditPlugin from './vite-plugin-moonshine-edit'
import moonshineFeedbackPlugin from './vite-plugin-moonshine-feedback'

// Authorship-feedback kill switch (see plugins/moonshine/FEEDBACK.md):
// moonshine.config.json → feedback.enabled, overridable with the env var
// MOONSHINE_FEEDBACK=off. When disabled, the feedback endpoints are never
// registered — the subsystem is one flag away from completely absent. The
// HUD/comment UI additionally degrade at runtime via /capabilities.
function feedbackEnabled(): boolean {
  const env = process.env.MOONSHINE_FEEDBACK
  if (env) return !/^(0|off|false|no)$/i.test(env)
  try {
    const cfgPath = path.resolve(__dirname, 'moonshine.config.json')
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
        feedback?: { enabled?: boolean }
      }
      return cfg.feedback?.enabled !== false
    }
  } catch {
    // malformed config → fall through to default-on
  }
  return true
}

export default defineConfig({
  // moonshineEditPlugin self-restricts to `apply: 'serve'`, so the
  // write-back endpoint exists only during `npm run dev`, never in a
  // production `vite build`. moonshineFeedbackPlugin does the same and is
  // additionally gated behind the feedback flag.
  plugins: [
    react(),
    moonshineEditPlugin(),
    ...(feedbackEnabled() ? [moonshineFeedbackPlugin()] : []),
  ],
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
