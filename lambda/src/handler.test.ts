import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const putEvent = vi.fn()
const putEventBatch = vi.fn()

vi.mock('./persist', () => ({
  putEvent: (...args: unknown[]) => putEvent(...args),
  putEventBatch: (...args: unknown[]) => putEventBatch(...args),
  newIngestId: () => '01HZTESTULID000000000000',
  dayUtcString: () => '2026-04-22',
}))

vi.mock('./authStore', () => ({
  getUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  createUser: vi.fn(),
}))

import { handler } from './handler'

function ev(over: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/analytics/events',
    rawQueryString: 'v=1',
    headers: { origin: 'https://echo.michaelj43.dev', 'content-type': 'application/json' },
    requestContext: {
      accountId: '1',
      apiId: 'x',
      domainName: 'x',
      domainPrefix: 'x',
      http: { method: 'POST', path: '/analytics/events', protocol: 'HTTP/1.1', sourceIp: '1.1.1.1' },
      requestId: 'r',
      routeKey: '$default',
      stage: '$default',
      time: '1',
      timeEpoch: 1,
    },
    isBase64Encoded: false,
    body: '{}',
    queryStringParameters: { v: '1' },
    ...over,
  } as APIGatewayProxyEventV2
}

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CORS_ALLOWED_BASE_HOST = 'michaelj43.dev'
    process.env.EVENTS_TABLE_NAME = 't'
    process.env.AUTH_USERS_TABLE_NAME = 'auth-u'
    process.env.AUTH_SESSIONS_TABLE_NAME = 'auth-s'
    process.env.AUTH_SESSION_TTL_SECONDS = '604800'
    process.env.IP_HASH_SECRET = 's'
    process.env.APP_VERSION = '0.0.1'
  })

  it('returns health without origin', async () => {
    const r = await handler(
      ev({
        rawPath: '/health',
        requestContext: {
          accountId: '1',
          apiId: 'x',
          domainName: 'x',
          domainPrefix: 'x',
          http: { method: 'GET', path: '/health', protocol: 'HTTP/1.1' },
          requestId: 'r',
          routeKey: '$default',
          stage: '$default',
          time: '1',
          timeEpoch: 1,
        },
        headers: {},
      }),
    )
    expect(r.statusCode).toBe(200)
    const j = JSON.parse(r.body ?? '{}')
    expect(j.ok).toBe(true)
  })

  it('POST /analytics/events single', async () => {
    const r = await handler(
      ev({
        body: JSON.stringify({
          event: {
            appId: 'app1',
            sessionId: 'sess',
            eventType: 'pageview',
            path: '/',
            clientTimestamp: 1,
          },
        }),
      }),
    )
    expect(r.statusCode).toBe(202)
    expect(putEvent).toHaveBeenCalledTimes(1)
    const row = putEvent.mock.calls[0][1] as { ipMasked: string; geoLabel: string }
    expect(row.ipMasked).toBe('1.1.1.*')
    expect(typeof row.geoLabel).toBe('string')
    const j = JSON.parse(r.body ?? '{}')
    expect(j.accepted).toBe(1)
    expect(j.ingestId).toBeDefined()
  })

  it('requires v=1', async () => {
    const r = await handler(
      ev({
        queryStringParameters: {},
        rawQueryString: '',
        body: JSON.stringify({
          event: {
            appId: 'app1',
            sessionId: 'sess',
            eventType: 'pageview',
            path: '/',
            clientTimestamp: 1,
          },
        }),
      }),
    )
    expect(r.statusCode).toBe(400)
  })

  it('batch same appId', async () => {
    const r = await handler(
      ev({
        body: JSON.stringify({
          events: [
            {
              appId: 'app1',
              sessionId: 'a',
              eventType: 'pageview',
              path: '/',
              clientTimestamp: 1,
            },
            {
              appId: 'app1',
              sessionId: 'b',
              eventType: 'click',
              path: '/x',
              clientTimestamp: 2,
            },
          ],
        }),
      }),
    )
    expect(r.statusCode).toBe(202)
    expect(putEventBatch).toHaveBeenCalledTimes(1)
    const rows = putEventBatch.mock.calls[0][1] as { ipMasked: string }[]
    expect(rows[0].ipMasked).toBe('1.1.1.*')
    expect(rows[1].ipMasked).toBe('1.1.1.*')
  })

  it('rejects bad json body', async () => {
    const r = await handler(ev({ body: 'not json' }))
    expect(r.statusCode).toBe(400)
  })

  it('fails if EVENTS_TABLE_NAME missing', async () => {
    delete process.env.EVENTS_TABLE_NAME
    const r = await handler(
      ev({
        body: JSON.stringify({
          event: {
            appId: 'a',
            sessionId: 's',
            eventType: 'p',
            path: '/',
            clientTimestamp: 0,
          },
        }),
      }),
    )
    expect(r.statusCode).toBe(500)
  })

  it('OPTIONS returns 204 for allowed', async () => {
    const r = await handler(
      ev({
        requestContext: {
          accountId: '1',
          apiId: 'x',
          domainName: 'x',
          domainPrefix: 'x',
          http: { method: 'OPTIONS', path: '/analytics/events', protocol: 'HTTP/1.1' },
          requestId: 'r',
          routeKey: '$default',
          stage: '$default',
          time: '1',
          timeEpoch: 1,
        },
        body: undefined,
      }),
    )
    expect(r.statusCode).toBe(204)
  })

  it('rejects mixed appId in batch', async () => {
    const r = await handler(
      ev({
        body: JSON.stringify({
          events: [
            {
              appId: 'a',
              sessionId: 's',
              eventType: 'pageview',
              path: '/',
              clientTimestamp: 1,
            },
            {
              appId: 'b',
              sessionId: 's',
              eventType: 'pageview',
              path: '/',
              clientTimestamp: 1,
            },
          ],
        }),
      }),
    )
    expect(r.statusCode).toBe(400)
  })

  it('OPTIONS /v1/ returns 204 for allowed origin with credentials', async () => {
    const r = await handler(
      ev({
        requestContext: {
          accountId: '1',
          apiId: 'x',
          domainName: 'x',
          domainPrefix: 'x',
          http: { method: 'OPTIONS', path: '/v1/auth/login', protocol: 'HTTP/1.1' },
          requestId: 'r',
          routeKey: '$default',
          stage: '$default',
          time: '1',
          timeEpoch: 1,
        },
        rawPath: '/v1/auth/login',
        body: undefined,
        headers: { origin: 'https://echo.michaelj43.dev' },
      }),
    )
    expect(r.statusCode).toBe(204)
    expect(r.headers?.['access-control-allow-credentials']).toBe('true')
  })

  it('GET unknown v1 path returns 404 with CORS', async () => {
    const r = await handler(
      ev({
        requestContext: {
          accountId: '1',
          apiId: 'x',
          domainName: 'x',
          domainPrefix: 'x',
          http: { method: 'GET', path: '/v1/unknown', protocol: 'HTTP/1.1' },
          requestId: 'r',
          routeKey: '$default',
          stage: '$default',
          time: '1',
          timeEpoch: 1,
        },
        rawPath: '/v1/unknown',
        body: undefined,
        headers: { origin: 'https://echo.michaelj43.dev' },
      }),
    )
    expect(r.statusCode).toBe(404)
    const j = JSON.parse(r.body ?? '{}')
    expect(j.error).toBe('not_found')
  })
})
