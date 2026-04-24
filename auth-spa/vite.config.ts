import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        signup: resolve(__dirname, 'signup.html'),
      },
    },
  },
})
