import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { z } from 'zod'
import { getCorsHeadersWithCredentials } from './cors'
import { buildSessionCookie, parseCookies, SESSION_COOKIE_NAME } from './cookieUtil'
import { firstAllowedOrDefault } from './returnUrl'
import {
  createSession,
  createUser,
  deleteSession,
  effectiveRole,
  getSession,
  getUserByEmail,
  verifyPassword,
} from './authStore'

const JSON_HEADERS = { 'content-type': 'application/json' }

const authBody = z.object({
  email: z.string().min(1).max(256),
  password: z.string().min(1).max(400),
  returnUrl: z.string().url().optional(),
})

const registerBody = authBody

function v1Json(
  status: number,
  body: unknown,
  cors: Record<string, string>,
  cookies: string[] | null,
): APIGatewayProxyResultV2 {
  const o: APIGatewayProxyResultV2 = {
    statusCode: status,
    headers: { ...cors, ...JSON_HEADERS },
    body: JSON.stringify(body),
  }
  if (cookies?.length) {
    o.cookies = cookies
  }
  return o
}

function cookieDomainForSetCookie(baseHost: string): string {
  return baseHost.trim().toLowerCase()
}

function getSessionIdFromEvent(event: APIGatewayProxyEventV2): string | null {
  const fromArray = event.cookies
  if (Array.isArray(fromArray)) {
    for (const c of fromArray) {
      const p = c.split('=')
      if (p[0] === SESSION_COOKIE_NAME && p[1]) {
        return decodeURIComponent(p[1].split(';')[0].trim())
      }
    }
  }
  const ch = event.headers['cookie'] ?? event.headers['Cookie'] ?? event.headers['COOKIE'] ?? undefined
  const map = parseCookies(ch)
  return map[SESSION_COOKIE_NAME] ?? null
}

function corsV1(
  event: APIGatewayProxyEventV2,
  baseHost: string,
  localhost: string | undefined,
): { headers: Record<string, string>; allow: boolean } {
  const requestOrigin = event.headers?.origin ?? event.headers?.Origin
  if (!requestOrigin) {
    return { allow: true, headers: { ...JSON_HEADERS } }
  }
  const c = getCorsHeadersWithCredentials(localhost, requestOrigin, baseHost)
  return { allow: c.allow, headers: c.allow ? { ...c.headers, ...JSON_HEADERS } : {} }
}

export async function handleV1Auth(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  baseHost: string,
  localhost: string | undefined,
): Promise<APIGatewayProxyResultV2 | null> {
  const c = corsV1(event, baseHost, localhost)
  if (!c.allow) {
    if (path.startsWith('/v1/') && (method === 'GET' || method === 'POST')) {
      return { statusCode: 403, body: 'Forbidden' }
    }
    return null
  }
  const corsH = c.headers
  const domain = cookieDomainForSetCookie(baseHost)
  const defaultApp = (process.env.AUTH_DEFAULT_APP_URL ?? '').trim()
  const allowRegister = (process.env.AUTH_ALLOW_REGISTER ?? 'false') === 'true'
  const cookieMax = parseInt(process.env.AUTH_SESSION_TTL_SECONDS ?? '604800', 10) || 604800

  if (method === 'POST' && path === '/v1/auth/login') {
    let raw: unknown
    try {
      raw = event.body ? JSON.parse(event.body) : {}
    } catch {
      return v1Json(400, { error: 'bad_request', message: 'Body must be valid JSON.' }, corsH, null)
    }
    const p = authBody.safeParse(raw)
    if (!p.success) {
      return v1Json(400, { error: 'bad_request', message: 'Invalid body.' }, corsH, null)
    }
    const { email, password, returnUrl } = p.data
    const user = await getUserByEmail(email)
    if (!user) {
      return v1Json(401, { error: 'unauthorized' }, corsH, null)
    }
    const ok = await verifyPassword(user, password)
    if (!ok) {
      return v1Json(401, { error: 'unauthorized' }, corsH, null)
    }
    const sess = await createSession({ email: user.email, userId: user.userId, passwordHash: user.passwordHash, createdAt: user.createdAt })
    const redirect = firstAllowedOrDefault(returnUrl, baseHost, defaultApp)
    const cookie = buildSessionCookie(sess.sessionId, cookieMax, domain)
    return v1Json(
      200,
      { user: { email: user.email, id: user.userId, role: effectiveRole(user) }, redirect },
      corsH,
      [cookie],
    )
  }

  if (method === 'POST' && path === '/v1/auth/logout') {
    const sid = getSessionIdFromEvent(event)
    if (sid) {
      try {
        await deleteSession(sid)
      } catch {
        /* ignore */
      }
    }
    const cookie = buildSessionCookie(null, 0, domain)
    return v1Json(200, { ok: true }, corsH, [cookie])
  }

  if (method === 'GET' && path === '/v1/auth/me') {
    const sid = getSessionIdFromEvent(event)
    if (!sid) {
      return v1Json(401, { error: 'unauthorized' }, corsH, null)
    }
    const s = await getSession(sid)
    if (!s) {
      return v1Json(401, { error: 'unauthorized' }, corsH, [buildSessionCookie(null, 0, domain)])
    }
    const user = await getUserByEmail(s.email)
    if (!user) {
      return v1Json(401, { error: 'unauthorized' }, corsH, [buildSessionCookie(null, 0, domain)])
    }
    return v1Json(
      200,
      { user: { email: user.email, id: user.userId, role: effectiveRole(user) } },
      corsH,
      null,
    )
  }

  if (method === 'POST' && path === '/v1/auth/register') {
    if (!allowRegister) {
      return v1Json(404, { error: 'not_found' }, corsH, null)
    }
    let raw: unknown
    try {
      raw = event.body ? JSON.parse(event.body) : {}
    } catch {
      return v1Json(400, { error: 'bad_request', message: 'Body must be valid JSON.' }, corsH, null)
    }
    const p = registerBody.safeParse(raw)
    if (!p.success) {
      return v1Json(400, { error: 'bad_request', message: 'Invalid body.' }, corsH, null)
    }
    const { email, password, returnUrl } = p.data
    const r = await createUser(email, password)
    if (r.ok === false) {
      if (r.error === 'invalid_password') {
        return v1Json(400, { error: 'invalid_request' }, corsH, null)
      }
      return v1Json(400, { error: 'invalid_request' }, corsH, null)
    }
    const user = r.user
    const sess = await createSession(user)
    const redirect = firstAllowedOrDefault(returnUrl, baseHost, defaultApp)
    const cookie = buildSessionCookie(sess.sessionId, cookieMax, domain)
    return v1Json(
      201,
      { user: { email: user.email, id: user.userId, role: effectiveRole(user) }, redirect },
      corsH,
      [cookie],
    )
  }

  if (path.startsWith('/v1/auth/')) {
    return v1Json(404, { error: 'not_found' }, corsH, null)
  }

  return null
}

export async function requireSession(
  event: APIGatewayProxyEventV2,
): Promise<
  | { ok: true; userId: string; email: string; sessionId: string }
  | { ok: false; domain: string; clearCookie?: string }
> {
  const base = process.env.CORS_ALLOWED_BASE_HOST?.trim() ?? ''
  const domain = cookieDomainForSetCookie(base)
  const sid = getSessionIdFromEvent(event)
  if (!sid) {
    return { ok: false, domain }
  }
  const s = await getSession(sid)
  if (!s) {
    return { ok: false, clearCookie: buildSessionCookie(null, 0, domain), domain }
  }
  return { ok: true, userId: s.userId, email: s.email, sessionId: sid }
}
