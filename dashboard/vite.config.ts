import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Defaults from M43_INTEGRATION.md; override with VITE_API_BASE_URL / VITE_AUTH_ORIGIN in .env
  const p = {
    DASH_M43_API: (env.VITE_API_BASE_URL || 'https://api.michaelj43.dev').replace(/\/$/, ''),
    DASH_M43_AUTH_ORIGIN: (env.VITE_AUTH_ORIGIN || 'https://auth.michaelj43.dev').replace(/\/$/, ''),
  }
  return {
    server: { port: 5174 },
    preview: { port: 4174 },
    plugins: [
      {
        name: 'dashboard-html-m43-placeholders',
        transformIndexHtml(html) {
          return html
            .replaceAll('__DASH_M43_API__', p.DASH_M43_API)
            .replaceAll('__DASH_M43_AUTH_ORIGIN__', p.DASH_M43_AUTH_ORIGIN)
        },
      },
    ],
  }
})
