import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { getUserByEmail, isAdminUser, listAuthUsers, normalizeEmail, setUserRole } from './authStore'
import {
  getRegistrationStatus,
  registrationEnvAllows,
  setRegistrationPreference,
} from './platformSettings'
import { buildSessionCookie } from './cookieUtil'
import { getCorsHeadersWithCredentials } from './cors'
import { z } from 'zod'
import { queryEventsByAppAndDay } from './v1Admin'
import { requireSession } from './v1Auth'

const JSON_HEADERS = { 'content-type': 'application/json' }

function corsV1(
  event: import('aws-lambda').APIGatewayProxyEventV2,
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

const qSchema = z.object({
  appId: z.string().min(1).max(256),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional().nullable(),
})

const usersListSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional().nullable(),
})

const patchUserSchema = z.object({
  email: z.string().min(1).max(256),
  role: z.enum(['admin', 'user']),
})

const patchSiteSchema = z.object({
  allowRegister: z.boolean(),
})

function encodeCursor(key: Record<string, unknown> | undefined): string | null {
  if (!key) {
    return null
  }
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url')
}

function decodeUsersCursor(s: string | undefined | null): Record<string, unknown> | undefined {
  if (!s?.trim()) {
    return undefined
  }
  try {
    const raw = Buffer.from(s, 'base64url').toString('utf8')
    const o = JSON.parse(raw) as unknown
    if (o && typeof o === 'object' && !Array.isArray(o) && typeof (o as { email?: unknown }).email === 'string') {
      return o as Record<string, unknown>
    }
  } catch {
    /* invalid */
  }
  return undefined
}

async function requireAdmin(
  event: APIGatewayProxyEventV2,
  baseHost: string,
  corsH: Record<string, string>,
): Promise<
  | { ok: true; session: { userId: string; email: string; sessionId: string } }
  | { ok: false; result: APIGatewayProxyResultV2 }
> {
  const session = await requireSession(event)
  if (!session.ok) {
    const o: APIGatewayProxyResultV2 = {
      statusCode: 401,
      headers: { ...corsH, ...JSON_HEADERS },
      body: JSON.stringify({ error: 'unauthorized' }),
    }
    if (session.clearCookie) {
      o.cookies = [session.clearCookie]
    }
    return { ok: false, result: o }
  }
  const user = await getUserByEmail(session.email)
  if (!user) {
    const domain = baseHost.trim().toLowerCase()
    const o: APIGatewayProxyResultV2 = {
      statusCode: 401,
      headers: { ...corsH, ...JSON_HEADERS },
      body: JSON.stringify({ error: 'unauthorized' }),
    }
    if (domain) {
      o.cookies = [buildSessionCookie(null, 0, domain)]
    }
    return { ok: false, result: o }
  }
  if (!isAdminUser(user)) {
    return {
      ok: false,
      result: { statusCode: 403, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'forbidden' }) },
    }
  }
  return { ok: true, session }
}

export async function handleV1Admin(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  baseHost: string,
  localhost: string | undefined,
): Promise<APIGatewayProxyResultV2 | null> {
  if (!path.startsWith('/v1/admin/')) {
    return null
  }
  const c = corsV1(event, baseHost, localhost)
  if (!c.allow) {
    return { statusCode: 403, body: 'Forbidden' }
  }
  const corsH = c.headers

  if (method === 'GET' && path === '/v1/admin/analytics/events') {
    const gate = await requireAdmin(event, baseHost, corsH)
    if (!gate.ok) {
      return gate.result
    }
    const qs = event.queryStringParameters ?? {}
    const p = qSchema.safeParse({ ...qs, cursor: qs.cursor })
    if (!p.success) {
      return { statusCode: 400, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'bad_request' }) }
    }
    const { appId, day, limit, cursor } = p.data
    const r = await queryEventsByAppAndDay(appId, day, limit, cursor ?? null)
    return { statusCode: 200, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify(r) }
  }

  if (method === 'GET' && path === '/v1/admin/users') {
    const gate = await requireAdmin(event, baseHost, corsH)
    if (!gate.ok) {
      return gate.result
    }
    const qs = event.queryStringParameters ?? {}
    const p = usersListSchema.safeParse({ ...qs, cursor: qs.cursor })
    if (!p.success) {
      return { statusCode: 400, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'bad_request' }) }
    }
    const startKey = decodeUsersCursor(p.data.cursor ?? null)
    if (p.data.cursor && startKey === undefined) {
      return { statusCode: 400, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'bad_request' }) }
    }
    const { items, lastKey } = await listAuthUsers(p.data.limit, startKey)
    const nextCursor = encodeCursor(lastKey)
    return {
      statusCode: 200,
      headers: { ...corsH, ...JSON_HEADERS },
      body: JSON.stringify({ items, nextCursor }),
    }
  }

  if (method === 'GET' && path === '/v1/admin/site') {
    const gate = await requireAdmin(event, baseHost, corsH)
    if (!gate.ok) {
      return gate.result
    }
    const site = await getRegistrationStatus()
    return { statusCode: 200, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ site }) }
  }

  if (method === 'PATCH' && path === '/v1/admin/site') {
    const gate = await requireAdmin(event, baseHost, corsH)
    if (!gate.ok) {
      return gate.result
    }
    if (!registrationEnvAllows()) {
      return {
        statusCode: 403,
        headers: { ...corsH, ...JSON_HEADERS },
        body: JSON.stringify({ error: 'registration_locked_by_env' }),
      }
    }
    let raw: unknown
    try {
      raw = event.body ? JSON.parse(event.body) : {}
    } catch {
      return { statusCode: 400, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'bad_request' }) }
    }
    const parsed = patchSiteSchema.safeParse(raw)
    if (!parsed.success) {
      return { statusCode: 400, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'bad_request' }) }
    }
    await setRegistrationPreference(parsed.data.allowRegister, gate.session.email)
    const site = await getRegistrationStatus()
    return { statusCode: 200, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ site }) }
  }

  if (method === 'PATCH' && path === '/v1/admin/users') {
    const gate = await requireAdmin(event, baseHost, corsH)
    if (!gate.ok) {
      return gate.result
    }
    let raw: unknown
    try {
      raw = event.body ? JSON.parse(event.body) : {}
    } catch {
      return { statusCode: 400, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'bad_request' }) }
    }
    const parsed = patchUserSchema.safeParse(raw)
    if (!parsed.success) {
      return { statusCode: 400, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'bad_request' }) }
    }
    const { email, role } = parsed.data
    if (role === 'user' && normalizeEmail(email) === normalizeEmail(gate.session.email)) {
      return {
        statusCode: 400,
        headers: { ...corsH, ...JSON_HEADERS },
        body: JSON.stringify({ error: 'cannot_demote_self' }),
      }
    }
    const upd = await setUserRole(email, role)
    if (!upd.ok) {
      return { statusCode: 404, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'not_found' }) }
    }
    const updated = await getUserByEmail(email)
    if (!updated) {
      return { statusCode: 404, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'not_found' }) }
    }
    return {
      statusCode: 200,
      headers: { ...corsH, ...JSON_HEADERS },
      body: JSON.stringify({
        user: { email: updated.email, id: updated.userId, role: role === 'admin' ? 'admin' : 'user' },
      }),
    }
  }

  return { statusCode: 404, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'not_found' }) }
}
