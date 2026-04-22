#!/usr/bin/env node
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const u = (process.env.DREDD_BASE_URL || '').trim()
if (!u) {
  process.stderr.write('Set DREDD_BASE_URL to the API base URL, e.g. https://api.example.com\n')
  process.exit(1)
}

const here = __dirname
const openapi = join(here, '..', 'openapi', 'openapi.yaml')
const hook = join(here, 'dredd-hooks.cjs')
const args = [openapi, u, '--hookfiles', hook]
const dredd = resolve(here, 'node_modules', '.bin', 'dredd')

if (existsSync(dredd)) {
  const r = spawnSync(dredd, args, { stdio: 'inherit', cwd: here, env: process.env })
  process.exit(r.status === null || r.error ? 1 : r.status)
}
const r = spawnSync('npx', ['dredd', ...args], { stdio: 'inherit', cwd: here, env: process.env, shell: true })
process.exit(r.status === null || r.error ? 1 : r.status)
