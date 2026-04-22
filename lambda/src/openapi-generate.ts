/**
 * Run: npx tsx src/openapi-generate.ts (from lambda/)
 * Writes ../../openapi/openapi.yaml
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { stringify as yamlStringify } from 'yaml'
import { z } from 'zod'
import { ingestRequestBodySchema, versionQuerySchema } from './schemas'

extendZodWithOpenApi(z)

const registry = new OpenAPIRegistry()

registry.register('Health', z.object({ ok: z.boolean(), version: z.string() }).strict())
registry.register('IngestAccepted', z.object({ accepted: z.number(), ingestId: z.string().optional() }).strict())
registry.register('ErrorBody', z.object({ error: z.string(), message: z.string().optional() }).passthrough())

registry.registerPath({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  summary: 'Liveness and deployment version',
  description: 'Returns ok and the deployed lambda package version string.',
  tags: ['Health'],
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/analytics/events',
  operationId: 'postAnalyticsEvents',
  summary: 'Ingest one or more analytics events',
  description: 'Send a single `event` or a batched `events` array. Query param `v=1` is required.',
  tags: ['Analytics'],
  request: {
    query: versionQuerySchema,
    body: {
      content: {
        'application/json': {
          schema: ingestRequestBodySchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Accepted',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/IngestAccepted' } } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } },
    },
  },
})

const generator = new OpenApiGeneratorV3(registry.definitions)
const doc: Record<string, unknown> = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'Shared API Platform',
    version: '1.0.0',
    description: 'Analytics ingest and health. Require ?v=1 on POST /analytics/events.',
    contact: { name: 'Platform', url: 'https://michaelj43.dev' },
  },
  tags: [
    { name: 'Health', description: 'Liveness' },
    { name: 'Analytics', description: 'Event ingest' },
  ],
  servers: [{ url: 'https://api.michaelj43.dev', description: 'Production (example)' }],
})

// Dredd / Fury: expand URI templates (e.g. in response examples) need a *parameter-level*
// `example` for `v`; `schema.example` alone is not enough.
const postParams = (doc as { paths?: Record<string, { post?: { parameters?: unknown[] } }> })
  .paths?.['/analytics/events']?.post?.parameters
if (Array.isArray(postParams)) {
  for (const p of postParams) {
    if (p && typeof p === 'object' && p !== null && 'name' in p && p.name === 'v' && 'in' in p && p.in === 'query') {
      ;(p as { example?: string }).example = '1'
    }
  }
}

const __dir = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dir, '..', '..', 'openapi')
const out = resolve(outDir, 'openapi.yaml')
mkdirSync(outDir, { recursive: true })
writeFileSync(out, yamlStringify(doc, { lineWidth: 120 }), 'utf8')
console.log('Wrote', out)
