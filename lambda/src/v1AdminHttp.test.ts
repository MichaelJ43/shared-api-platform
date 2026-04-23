import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'

const requireSession = vi.hoisted(() => vi.fn())
const queryEventsByAppAndDay = vi.hoisted(() => vi.fn())

vi.mock('./v1Auth', () => ({ requireSession }))
vi.mock('./v1Admin', () => ({ queryEventsByAppAndDay }))

import { handleV1Admin } from './v1AdminHttp'

function ev(over: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/v1/admin/analytics/events',
    headers: { origin: 'https://x.michaelj43.dev' },
    requestContext: {
      accountId: '1',
      apiId: 'x',
      domainName: 'x',
      domainPrefix: 'x',
      http: { method: 'GET', path: '/v1/admin/analytics/events', protocol: 'HTTP/1.1', sourceIp: '1.1.1.1' },
      requestId: 'r',
      routeKey: '$default',
      stage: '$default',
      time: '1',
      timeEpoch: 1,
    },
    isBase64Encoded: false,
    queryStringParameters: { appId: 'a', day: '2026-01-15' },
    ...over,
  } as APIGatewayProxyEventV2
}

describe('handleV1Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for non-admin paths', async () => {
    const r = await handleV1Admin(
      ev({ requestContext: { ...ev().requestContext, http: { method: 'GET', path: '/health' } } }),
      'GET',
      '/health',
      'michaelj43.dev',
      undefined,
    )
    expect(r).toBeNull()
  })

  it('403 for bad CORS', async () => {
    const r = await handleV1Admin(
      ev({ headers: { origin: 'https://evil.com' } }),
      'GET',
      '/v1/admin/analytics/events',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(403)
  })

  it('401 when session required fails', async () => {
    requireSession.mockResolvedValue({ ok: false, domain: 'michaelj43.dev' })
    const r = await handleV1Admin(
      ev(),
      'GET',
      '/v1/admin/analytics/events',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(401)
  })

  it('401 includes clear-cookie when provided', async () => {
    requireSession.mockResolvedValue({ ok: false, domain: 'michaelj43.dev', clearCookie: 'sap_session=;' })
    const r = await handleV1Admin(
      ev(),
      'GET',
      '/v1/admin/analytics/events',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(401)
    expect(r?.cookies).toBeDefined()
  })

  it('400 for bad query', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    const r = await handleV1Admin(
      ev({ queryStringParameters: { appId: 'a', day: 'not-a-day' } }),
      'GET',
      '/v1/admin/analytics/events',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(400)
  })

  it('200 with query result', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    queryEventsByAppAndDay.mockResolvedValue({ items: [{ t: 1 }], nextCursor: null })
    const r = await handleV1Admin(
      ev(),
      'GET',
      '/v1/admin/analytics/events',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(200)
    const j = JSON.parse(r?.body ?? '{}')
    expect(j.items).toEqual([{ t: 1 }])
  })

  it('404 for unknown admin path', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    const r = await handleV1Admin(
      ev({ requestContext: { ...ev().requestContext, http: { method: 'GET', path: '/v1/admin/other', protocol: 'HTTP/1.1' } } }),
      'GET',
      '/v1/admin/other',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(404)
  })
})
