import { describe, expect, it } from 'vitest'
import { ingestRequestBodySchema, versionQuerySchema } from './schemas'

describe('versionQuerySchema', () => {
  it('accepts v=1', () => {
    expect(versionQuerySchema.safeParse({ v: '1' }).success).toBe(true)
  })
  it('rejects v=2', () => {
    expect(versionQuerySchema.safeParse({ v: '2' }).success).toBe(false)
  })
})

describe('ingestRequestBodySchema', () => {
  it('accepts single event', () => {
    const p = ingestRequestBodySchema.safeParse({
      event: {
        appId: 'a',
        sessionId: 's',
        eventType: 'pageview',
        path: '/',
        clientTimestamp: 1,
      },
    })
    expect(p.success).toBe(true)
  })
  it('accepts batch', () => {
    const p = ingestRequestBodySchema.safeParse({
      events: [
        {
          appId: 'a',
          sessionId: 's',
          eventType: 'pageview',
          path: '/',
          clientTimestamp: 1,
        },
      ],
    })
    expect(p.success).toBe(true)
  })
  it('rejects extra keys in event', () => {
    const p = ingestRequestBodySchema.safeParse({
      event: {
        appId: 'a',
        sessionId: 's',
        eventType: 'pageview',
        path: '/',
        clientTimestamp: 1,
        x: 1,
      },
    })
    expect(p.success).toBe(false)
  })
})
