import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { getUserByEmail, isAdminUser } from './authStore'
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
    const session = await requireSession(event)
    if (!session.ok) {
      const o: APIGatewayProxyResultV2 = { statusCode: 401, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'unauthorized' }) }
      if (session.clearCookie) {
        o.cookies = [session.clearCookie]
      }
      return o
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
      return o
    }
    if (!isAdminUser(user)) {
      return { statusCode: 403, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'forbidden' }) }
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

  return { statusCode: 404, headers: { ...corsH, ...JSON_HEADERS }, body: JSON.stringify({ error: 'not_found' }) }
}
