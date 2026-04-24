import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'

const auth = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  createUser: vi.fn(),
}))

vi.mock('./authStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./authStore')>()
  return { ...actual, ...auth }
})

import { handleV1Auth, requireSession } from './v1Auth'

function baseEvent(over: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/v1/auth/login',
    headers: { origin: 'https://app.michaelj43.dev' },
    requestContext: {
      accountId: '1',
      apiId: 'x',
      domainName: 'x',
      domainPrefix: 'x',
      http: { method: 'POST', path: '/v1/auth/login', protocol: 'HTTP/1.1', sourceIp: '1.1.1.1' },
      requestId: 'r',
      routeKey: '$default',
      stage: '$default',
      time: '1',
      timeEpoch: 1,
    },
    isBase64Encoded: false,
    body: '{}',
    ...over,
  } as APIGatewayProxyEventV2
}

describe('handleV1Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CORS_ALLOWED_BASE_HOST = 'michaelj43.dev'
    process.env.AUTH_DEFAULT_APP_URL = 'https://app.michaelj43.dev'
    process.env.AUTH_ALLOW_REGISTER = 'false'
    process.env.AUTH_SESSION_TTL_SECONDS = '3600'
  })

  it('rejects CORS for bad origin with 403 on POST /v1/auth/', async () => {
    const r = await handleV1Auth(
      baseEvent({
        headers: { origin: 'https://evil.com' },
        body: JSON.stringify({ email: 'a@b.com', password: 'Valid1!@#ab' }),
      }),
      'POST',
      '/v1/auth/login',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(403)
  })

  it('POST login returns 400 for invalid JSON', async () => {
    const r = await handleV1Auth(
      baseEvent({ body: 'not-json' }),
      'POST',
      '/v1/auth/login',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(400)
  })

  it('POST login returns 400 for bad body', async () => {
    const r = await handleV1Auth(
      baseEvent({ body: JSON.stringify({ email: 'x' }) }),
      'POST',
      '/v1/auth/login',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(400)
  })

  it('POST login 401 when user missing', async () => {
    auth.getUserByEmail.mockResolvedValue(null)
    const r = await handleV1Auth(
      baseEvent({
        body: JSON.stringify({ email: 'a@b.com', password: 'Valid1!@#ab' }),
      }),
      'POST',
      '/v1/auth/login',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(401)
  })

  it('POST login 401 on bad password', async () => {
    auth.getUserByEmail.mockResolvedValue({
      email: 'a@b.com',
      userId: '1',
      passwordHash: 'h',
      createdAt: 't',
    })
    auth.verifyPassword.mockResolvedValue(false)
    const r = await handleV1Auth(
      baseEvent({ body: JSON.stringify({ email: 'a@b.com', password: 'Valid1!@#ab' }) }),
      'POST',
      '/v1/auth/login',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(401)
  })

  it('POST login 200 and sets cookie', async () => {
    auth.getUserByEmail.mockResolvedValue({
      email: 'a@b.com',
      userId: '1',
      passwordHash: 'h',
      createdAt: 't',
    })
    auth.verifyPassword.mockResolvedValue(true)
    auth.createSession.mockResolvedValue({ sessionId: 'sess1', maxAge: 1, expiresAt: 1, ttl: 1 })
    const r = await handleV1Auth(
      baseEvent({ body: JSON.stringify({ email: 'a@b.com', password: 'Valid1!@#ab' }) }),
      'POST',
      '/v1/auth/login',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(200)
    const body = JSON.parse(r?.body ?? '{}')
    expect(body.user).toEqual({ email: 'a@b.com', id: '1', role: 'user' })
    expect(r?.cookies?.length).toBeGreaterThan(0)
  })

  it('POST logout clears cookie and deletes session from cookies array', async () => {
    auth.deleteSession.mockResolvedValue(undefined)
    const r = await handleV1Auth(
      {
        ...baseEvent({
          requestContext: {
            ...baseEvent().requestContext,
            http: { method: 'POST', path: '/v1/auth/logout', protocol: 'HTTP/1.1' },
          },
        }),
        rawPath: '/v1/auth/logout',
        cookies: ['sap_session=abc%3B'],
      } as APIGatewayProxyEventV2,
      'POST',
      '/v1/auth/logout',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(200)
    expect(auth.deleteSession).toHaveBeenCalled()
  })

  it('GET /v1/auth/me 401 without session', async () => {
    const e = {
      ...baseEvent({
        headers: { origin: 'https://app.michaelj43.dev' },
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'GET', path: '/v1/auth/me', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/me',
        body: undefined,
      }),
    } as APIGatewayProxyEventV2
    const r = await handleV1Auth(e, 'GET', '/v1/auth/me', 'michaelj43.dev', undefined)
    expect(r?.statusCode).toBe(401)
  })

  it('GET /v1/auth/me 401 invalid session with clear cookie', async () => {
    auth.getSession.mockResolvedValue(null)
    const e = {
      ...baseEvent({
        headers: { origin: 'https://app.michaelj43.dev', cookie: 'sap_session=missing' },
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'GET', path: '/v1/auth/me', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/me',
        body: undefined,
      }),
    } as APIGatewayProxyEventV2
    const r = await handleV1Auth(e, 'GET', '/v1/auth/me', 'michaelj43.dev', undefined)
    expect(r?.statusCode).toBe(401)
  })

  it('GET /v1/auth/me 200', async () => {
    auth.getSession.mockResolvedValue({ userId: '1', email: 'a@b.com', expiresAt: Date.now() + 1000 })
    auth.getUserByEmail.mockResolvedValue({
      email: 'a@b.com',
      userId: '1',
      passwordHash: 'h',
      createdAt: 't',
    })
    const e = {
      ...baseEvent({
        headers: { origin: 'https://app.michaelj43.dev', cookie: 'sap_session=s1' },
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'GET', path: '/v1/auth/me', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/me',
        body: undefined,
      }),
    } as APIGatewayProxyEventV2
    const r = await handleV1Auth(e, 'GET', '/v1/auth/me', 'michaelj43.dev', undefined)
    expect(r?.statusCode).toBe(200)
    const body = JSON.parse(r?.body ?? '{}')
    expect(body.user).toEqual({ email: 'a@b.com', id: '1', role: 'user' })
  })

  it('GET /v1/auth/me 200 admin role', async () => {
    auth.getSession.mockResolvedValue({ userId: '1', email: 'a@b.com', expiresAt: Date.now() + 1000 })
    auth.getUserByEmail.mockResolvedValue({
      email: 'a@b.com',
      userId: '1',
      passwordHash: 'h',
      createdAt: 't',
      role: 'admin',
    })
    const e = {
      ...baseEvent({
        headers: { origin: 'https://app.michaelj43.dev', cookie: 'sap_session=s1' },
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'GET', path: '/v1/auth/me', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/me',
        body: undefined,
      }),
    } as APIGatewayProxyEventV2
    const r = await handleV1Auth(e, 'GET', '/v1/auth/me', 'michaelj43.dev', undefined)
    expect(r?.statusCode).toBe(200)
    expect(JSON.parse(r?.body ?? '{}').user.role).toBe('admin')
  })

  it('GET /v1/auth/me 401 when user row missing', async () => {
    auth.getSession.mockResolvedValue({ userId: '1', email: 'a@b.com', expiresAt: Date.now() + 1000 })
    auth.getUserByEmail.mockResolvedValue(null)
    const e = {
      ...baseEvent({
        headers: { origin: 'https://app.michaelj43.dev', cookie: 'sap_session=s1' },
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'GET', path: '/v1/auth/me', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/me',
        body: undefined,
      }),
    } as APIGatewayProxyEventV2
    const r = await handleV1Auth(e, 'GET', '/v1/auth/me', 'michaelj43.dev', undefined)
    expect(r?.statusCode).toBe(401)
  })

  it('register returns 404 when disabled', async () => {
    const r = await handleV1Auth(
      baseEvent({
        body: JSON.stringify({ email: 'n@b.com', password: 'Valid1!@#ab' }),
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'POST', path: '/v1/auth/register', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/register',
      }) as APIGatewayProxyEventV2,
      'POST',
      '/v1/auth/register',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(404)
  })

  it('register 201 when enabled', async () => {
    process.env.AUTH_ALLOW_REGISTER = 'true'
    auth.createUser.mockResolvedValue({
      ok: true,
      user: { email: 'n@b.com', userId: 'u', passwordHash: 'h', createdAt: 't' },
    })
    auth.createSession.mockResolvedValue({ sessionId: 'ns', maxAge: 1, expiresAt: 1, ttl: 1 })
    const r = await handleV1Auth(
      baseEvent({
        body: JSON.stringify({ email: 'n@b.com', password: 'Valid1!@#ab' }),
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'POST', path: '/v1/auth/register', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/register',
      }) as APIGatewayProxyEventV2,
      'POST',
      '/v1/auth/register',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(201)
  })

  it('register maps invalid password to 400', async () => {
    process.env.AUTH_ALLOW_REGISTER = 'true'
    auth.createUser.mockResolvedValue({ ok: false, error: 'invalid_password' })
    const r = await handleV1Auth(
      baseEvent({
        body: JSON.stringify({ email: 'n@b.com', password: 'Valid1!@#ab' }),
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'POST', path: '/v1/auth/register', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/register',
      }) as APIGatewayProxyEventV2,
      'POST',
      '/v1/auth/register',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(400)
  })

  it('returns 404 for unknown auth path', async () => {
    const r = await handleV1Auth(
      baseEvent({
        requestContext: {
          ...baseEvent().requestContext,
          http: { method: 'GET', path: '/v1/auth/nope', protocol: 'HTTP/1.1' },
        },
        rawPath: '/v1/auth/nope',
        body: undefined,
      }) as APIGatewayProxyEventV2,
      'GET',
      '/v1/auth/nope',
      'michaelj43.dev',
      undefined,
    )
    expect(r?.statusCode).toBe(404)
  })
})

describe('requireSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CORS_ALLOWED_BASE_HOST = 'michaelj43.dev'
  })

  it('fails without sid', async () => {
    const s = await requireSession(baseEvent({ body: undefined, headers: {} }))
    expect(s.ok).toBe(false)
    if (!s.ok) {
      expect(s.domain).toBe('michaelj43.dev')
    }
  })

  it('fails with invalid session and clearCookie', async () => {
    auth.getSession.mockResolvedValue(null)
    const e = {
      ...baseEvent({ body: undefined, headers: { cookie: 'sap_session=bad' } }),
    } as APIGatewayProxyEventV2
    const s = await requireSession(e)
    expect(s.ok).toBe(false)
    if (!s.ok) {
      expect(s.clearCookie).toBeDefined()
    }
  })

  it('succeeds with valid session', async () => {
    auth.getSession.mockResolvedValue({ userId: '1', email: 'a@b.com', expiresAt: Date.now() + 1 })
    const s = await requireSession(
      baseEvent({ body: undefined, headers: { cookie: 'sap_session=good' } }) as APIGatewayProxyEventV2,
    )
    expect(s).toEqual(
      expect.objectContaining({ ok: true, userId: '1', email: 'a@b.com', sessionId: 'good' }),
    )
  })
})
