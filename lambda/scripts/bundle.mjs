import { mkdirSync, readFileSync, writeFileSync, createWriteStream, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import archiver from 'archiver'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dist = resolve(root, 'dist')
const outJs = resolve(dist, 'handler.js')

if (!existsSync(resolve(root, 'node_modules'))) {
  console.error('Run npm ci in lambda/ first')
  process.exit(1)
}

mkdirSync(dist, { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/handler.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: outJs,
  sourcemap: true,
  minify: false,
})

const outZip = resolve(dist, 'http.zip')
const output = createWriteStream(outZip)
const archive = archiver('zip', { zlib: { level: 9 } })
archive.pipe(output)
archive.file(outJs, { name: 'handler.js' })
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const lambdaPkg = { name: pkg.name, version: pkg.version, type: 'commonjs', main: 'handler.js' }
writeFileSync(resolve(dist, 'package.json'), JSON.stringify(lambdaPkg, null, 2) + '\n')
archive.file(resolve(dist, 'package.json'), { name: 'package.json' })
await new Promise((res, rej) => {
  output.on('close', res)
  archive.on('error', rej)
  archive.finalize()
})
console.log('Wrote', outZip)
