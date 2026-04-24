import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'

const requireSession = vi.hoisted(() => vi.fn())
const queryEventsByAppAndDay = vi.hoisted(() => vi.fn())
const getUserByEmail = vi.hoisted(() => vi.fn())
const listAuthUsers = vi.hoisted(() => vi.fn())
const setUserRole = vi.hoisted(() => vi.fn())
const getRegistrationStatus = vi.hoisted(() => vi.fn())
const setRegistrationPreference = vi.hoisted(() => vi.fn())
const registrationEnvAllows = vi.hoisted(() => vi.fn())

vi.mock('./v1Auth', () => ({ requireSession }))
vi.mock('./v1Admin', () => ({ queryEventsByAppAndDay }))
vi.mock('./authStore', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./authStore')>()
  return { ...mod, getUserByEmail, listAuthUsers, setUserRole }
})
vi.mock('./platformSettings', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./platformSettings')>()
  return { ...mod, getRegistrationStatus, setRegistrationPreference, registrationEnvAllows }
})

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

const adminUser = {
  email: 'a@b.com',
  userId: '1',
  passwordHash: 'h',
  createdAt: 't',
  role: 'admin' as const,
}

describe('handleV1Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserByEmail.mockResolvedValue(adminUser)
    listAuthUsers.mockResolvedValue({ items: [], lastKey: undefined })
    setUserRole.mockResolvedValue({ ok: true })
    getRegistrationStatus.mockResolvedValue({
      effective: false,
      envAllowsRegister: true,
      preference: false,
    })
    registrationEnvAllows.mockReturnValue(true)
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

  it('403 when user is not admin', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    getUserByEmail.mockResolvedValue({
      email: 'a@b.com',
      userId: '1',
      passwordHash: 'h',
      createdAt: 't',
    })
    const r = await handleV1Admin(
      ev(),
      'GET',
      '/v1/admin/analytics/events',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(403)
    expect(queryEventsByAppAndDay).not.toHaveBeenCalled()
  })

  it('401 when user row missing', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    getUserByEmail.mockResolvedValue(null)
    const r = await handleV1Admin(
      ev(),
      'GET',
      '/v1/admin/analytics/events',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(401)
    expect(r?.cookies?.length).toBeGreaterThan(0)
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

  it('GET /v1/admin/users returns items', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    listAuthUsers.mockResolvedValue({
      items: [{ email: 'z@b.com', userId: 'z', createdAt: 't', role: 'user' }],
      lastKey: undefined,
    })
    const r = await handleV1Admin(
      ev({
        rawPath: '/v1/admin/users',
        requestContext: {
          ...ev().requestContext,
          http: { method: 'GET', path: '/v1/admin/users', protocol: 'HTTP/1.1' },
        },
        queryStringParameters: {},
      }),
      'GET',
      '/v1/admin/users',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(200)
    const j = JSON.parse(r?.body ?? '{}')
    expect(j.items).toHaveLength(1)
    expect(j.items[0].email).toBe('z@b.com')
  })

  it('GET /v1/admin/users 400 for bad cursor', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    const r = await handleV1Admin(
      ev({
        rawPath: '/v1/admin/users',
        requestContext: {
          ...ev().requestContext,
          http: { method: 'GET', path: '/v1/admin/users', protocol: 'HTTP/1.1' },
        },
        queryStringParameters: { cursor: 'not-valid' },
      }),
      'GET',
      '/v1/admin/users',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(400)
  })

  it('PATCH user role 200', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    const promoted = {
      email: 'u2@b.com',
      userId: '2',
      passwordHash: 'h',
      createdAt: 't',
      role: 'admin' as const,
    }
    getUserByEmail.mockResolvedValueOnce(adminUser).mockResolvedValue(promoted)
    const r = await handleV1Admin(
      ev({
        rawPath: '/v1/admin/users',
        requestContext: {
          ...ev().requestContext,
          http: { method: 'PATCH', path: '/v1/admin/users', protocol: 'HTTP/1.1' },
        },
        body: JSON.stringify({ email: 'u2@b.com', role: 'admin' }),
        queryStringParameters: undefined,
      }),
      'PATCH',
      '/v1/admin/users',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(200)
    expect(setUserRole).toHaveBeenCalledWith('u2@b.com', 'admin')
    expect(JSON.parse(r?.body ?? '{}').user.role).toBe('admin')
  })

  it('GET /v1/admin/site returns registration flags', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    getRegistrationStatus.mockResolvedValue({
      effective: true,
      envAllowsRegister: true,
      preference: true,
    })
    const r = await handleV1Admin(
      ev({
        rawPath: '/v1/admin/site',
        requestContext: {
          ...ev().requestContext,
          http: { method: 'GET', path: '/v1/admin/site', protocol: 'HTTP/1.1' },
        },
        queryStringParameters: undefined,
      }),
      'GET',
      '/v1/admin/site',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(200)
    expect(JSON.parse(r?.body ?? '{}').site.effective).toBe(true)
  })

  it('PATCH /v1/admin/site updates preference', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    setRegistrationPreference.mockResolvedValue(undefined)
    getRegistrationStatus.mockResolvedValue({
      effective: true,
      envAllowsRegister: true,
      preference: true,
    })
    const r = await handleV1Admin(
      ev({
        rawPath: '/v1/admin/site',
        requestContext: {
          ...ev().requestContext,
          http: { method: 'PATCH', path: '/v1/admin/site', protocol: 'HTTP/1.1' },
        },
        body: JSON.stringify({ allowRegister: true }),
        queryStringParameters: undefined,
      }),
      'PATCH',
      '/v1/admin/site',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(200)
    expect(setRegistrationPreference).toHaveBeenCalledWith(true, 'a@b.com')
  })

  it('PATCH /v1/admin/site 403 when env disallows', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    registrationEnvAllows.mockReturnValue(false)
    const r = await handleV1Admin(
      ev({
        rawPath: '/v1/admin/site',
        requestContext: {
          ...ev().requestContext,
          http: { method: 'PATCH', path: '/v1/admin/site', protocol: 'HTTP/1.1' },
        },
        body: JSON.stringify({ allowRegister: true }),
        queryStringParameters: undefined,
      }),
      'PATCH',
      '/v1/admin/site',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(403)
    expect(setRegistrationPreference).not.toHaveBeenCalled()
  })

  it('PATCH cannot demote self', async () => {
    requireSession.mockResolvedValue({ ok: true, userId: '1', email: 'a@b.com', sessionId: 's' })
    const r = await handleV1Admin(
      ev({
        rawPath: '/v1/admin/users',
        requestContext: {
          ...ev().requestContext,
          http: { method: 'PATCH', path: '/v1/admin/users', protocol: 'HTTP/1.1' },
        },
        body: JSON.stringify({ email: 'a@b.com', role: 'user' }),
        queryStringParameters: undefined,
      }),
      'PATCH',
      '/v1/admin/users',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(400)
    expect(setUserRole).not.toHaveBeenCalled()
  })
})
