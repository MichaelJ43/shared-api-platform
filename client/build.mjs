import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const entry = join(root, 'src', 'index.ts')
const base = { entryPoints: [entry], bundle: true, minify: true, platform: 'browser', target: 'es2018' }

await build({ ...base, format: 'esm', outfile: join(root, 'dist', 'shared-analytics.mjs') })
await build({ ...base, format: 'iife', globalName: 'SharedApiAnalytics', outfile: join(root, 'dist', 'shared-analytics.iife.js') })

console.log('Wrote dist/shared-analytics.mjs and dist/shared-analytics.iife.js')
