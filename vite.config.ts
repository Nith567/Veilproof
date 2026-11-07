import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob: 'sha256-Ym3P8QZAOfAK6j+zXubnGqDWrzVmA+sAoh1BfdRj0+s='",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "connect-src * ws: wss:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'veilproof-csp',
      apply: 'build',
      transformIndexHtml(html: string) {
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        )
      },
    },
  ],
})
