import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'

extendZodWithOpenApi(z)

const eventSchema = z
  .object({
    appId: z
      .string()
      .min(1)
      .max(128)
      .describe('Client-assigned app identifier (opaque string)'),
    sessionId: z.string().min(1).max(128),
    eventType: z
      .string()
      .min(1)
      .max(64)
      .describe('e.g. pageview, click'),
    path: z.string().min(1).max(2048),
    clientTimestamp: z.union([z.string().max(64), z.number()]),
    context: z.record(z.string(), z.unknown()).optional().describe('Optional structured dimensions'),
  })
  .strict()

const singleBody = z
  .object({ event: eventSchema })
  .strict()

const batchBody = z
  .object({
    events: z.array(eventSchema).min(1).max(25),
  })
  .strict()

export const ingestRequestBodySchema = z
  .union([singleBody, batchBody])
  .openapi({ description: 'Exactly one of event or events' })

export type IngestRequestBody = z.infer<typeof ingestRequestBodySchema>

export const versionQuerySchema = z.object({
  v: z
    .string()
    .regex(/^1$/)
    .openapi({ param: { name: 'v', in: 'query', required: true }, example: '1' }),
})

export { eventSchema, singleBody, batchBody, z }
