/**
 * Downloads official lionsoul ip2region xdb files (not shipped in npm).
 * Non-China labels are English per upstream; China remains Chinese.
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const destDir = resolve(root, 'data/ip2region')

const FILES = [
  {
    name: 'ip2region_v4.xdb',
    url: 'https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v4.xdb',
    minBytes: 1_000_000,
  },
  {
    name: 'ip2region_v6.xdb',
    url: 'https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v6.xdb',
    minBytes: 1_000_000,
  },
]

mkdirSync(destDir, { recursive: true })

for (const f of FILES) {
  const dest = resolve(destDir, f.name)
  if (existsSync(dest) && statSync(dest).size >= f.minBytes) {
    continue
  }
  process.stderr.write(`Downloading ${f.name} …\n`)
  const res = await fetch(f.url)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch ${f.url}: ${res.status}`)
  }
  await pipeline(res.body, createWriteStream(dest))
  const sz = statSync(dest).size
  if (sz < f.minBytes) {
    throw new Error(`${f.name} download too small (${sz} bytes); delete and retry`)
  }
}
