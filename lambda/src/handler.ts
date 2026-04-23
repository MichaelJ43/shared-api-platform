import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { getCorsHeadersWithCredentials, withCors } from './cors'
import { getClientIp, hashClientIp } from './hashIp'
import { newIngestId, dayUtcString, putEvent, putEventBatch } from './persist'
import { ingestRequestBodySchema, versionQuerySchema } from './schemas'
import { handleV1Auth } from './v1Auth'
import { handleV1Admin } from './v1AdminHttp'

const JSON_HEADERS = { 'content-type': 'application/json' }

const APP_VERSION = process.env.APP_VERSION ?? '0.0.0'

function json(
  status: number,
  body: unknown,
  cors: Record<string, string>,
): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { ...cors, ...JSON_HEADERS },
    body: JSON.stringify(body),
  }
}

function badRequest(
  message: string,
  cors: Record<string, string>,
): APIGatewayProxyResultV2 {
  return json(400, { error: 'bad_request', message }, cors)
}

/** 204: omit `body` (HTTP API + payload v2 is happier than `body: ''` for no-content). */
function noContent204(
  headers: Record<string, string>,
): APIGatewayProxyResultV2 {
  return { statusCode: 204, headers }
}

function internalErrorCors(
  event: APIGatewayProxyEventV2,
  message: string,
): APIGatewayProxyResultV2 {
  const requestOrigin = event.headers?.origin ?? event.headers?.Origin
  const base = process.env.CORS_ALLOWED_BASE_HOST?.trim() ?? ''
  const localhostAllow = process.env.CORS_ALLOW_LOCALHOST?.trim()
  const c = getCorsHeadersWithCredentials(localhostAllow, requestOrigin, base)
  return {
    statusCode: 500,
    headers: c.allow
      ? { ...c.headers, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'internal_error', message }),
  }
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    return await handleEvent(event)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('handler unhandled', err)
    return internalErrorCors(event, process.env.NODE_ENV === 'test' ? msg : 'server_error')
  }
}

async function handleEvent(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const requestOrigin = event.headers?.origin ?? event.headers?.Origin
  const method = (event.requestContext?.http?.method ?? 'GET').toUpperCase()
  const path = event.requestContext?.http?.path ?? event.rawPath ?? '/'
  const base = process.env.CORS_ALLOWED_BASE_HOST?.trim() ?? ''
  const localhostAllow = process.env.CORS_ALLOW_LOCALHOST?.trim()

  if (method === 'OPTIONS' && path.startsWith('/v1/')) {
    const c = getCorsHeadersWithCredentials(localhostAllow, requestOrigin, base)
    if (!c.allow) {
      return { statusCode: 403, body: '' }
    }
    return noContent204(c.headers)
  }

  const c = withCors(localhostAllow, requestOrigin, base)
  const corsH = c.headers

  if (method === 'OPTIONS') {
    if (!c.allow) {
      return { statusCode: 403, body: '' }
    }
    return noContent204(corsH)
  }

  if (path.startsWith('/v1/')) {
    const v1a = await handleV1Auth(event, method, path, base, localhostAllow)
    if (v1a) {
      return v1a
    }
    const v1b = await handleV1Admin(event, method, path, base, localhostAllow)
    if (v1b) {
      return v1b
    }
    const c2 = getCorsHeadersWithCredentials(localhostAllow, requestOrigin, base)
    if (!c2.allow) {
      return { statusCode: 403, body: 'Forbidden', headers: {} }
    }
    return json(404, { error: 'not_found' }, c2.headers)
  }

  if (method === 'GET' && path === '/health') {
    if (requestOrigin && !c.allow) {
      return json(403, { error: 'cors' }, {})
    }
    const healthHeaders = requestOrigin && c.allow ? corsH : { ...JSON_HEADERS }
    return json(200, { ok: true, version: APP_VERSION }, healthHeaders)
  }

  if (method === 'POST' && path === '/analytics/events') {
    if (!c.allow) {
      return json(403, { error: 'cors' }, {})
    }
    const vParsed = versionQuerySchema.safeParse({
      v: event.queryStringParameters?.v,
    })
    if (!vParsed.success) {
      return badRequest('Query parameter v=1 is required for this route.', corsH)
    }
    if (!event.body) {
      return badRequest('Request body is required.', corsH)
    }
    let bodyRaw: unknown
    try {
      bodyRaw = JSON.parse(event.body) as unknown
    } catch {
      return badRequest('Body must be valid JSON.', corsH)
    }
    const bodyParsed = ingestRequestBodySchema.safeParse(bodyRaw)
    if (!bodyParsed.success) {
      return badRequest('Invalid event payload.', corsH)
    }
    const table = process.env.EVENTS_TABLE_NAME
    if (!table) {
      return json(500, { error: 'server_misconfiguration' }, corsH)
    }
    const now = Date.now()
    const day = dayUtcString(now)
    const sourceIp = getClientIp(event)
    const ipHash = hashClientIp(sourceIp, process.env.IP_HASH_SECRET)
    const ua = (event.headers['user-agent'] ?? event.headers['User-Agent'] ?? '').slice(0, 256)

    const b = bodyParsed.data
    if ('event' in b) {
      const ingestId = newIngestId()
      await putEvent(table, {
        appId: b.event.appId,
        event: b.event,
        serverTimestamp: now,
        serverTimestampDayUtc: day,
        ingestId,
        ipHash,
        userAgent: ua,
      })
      return json(202, { accepted: 1, ingestId }, corsH)
    }
    const events = b.events
    const appIds = new Set(events.map((e) => e.appId))
    if (appIds.size > 1) {
      return badRequest('All events in a batch must use the same appId.', corsH)
    }
    const rows = events.map((ev) => ({
      appId: ev.appId,
      event: ev,
      serverTimestamp: now,
      serverTimestampDayUtc: day,
      ingestId: newIngestId(),
      ipHash,
      userAgent: ua,
    }))
    await putEventBatch(table, rows)
    return json(202, { accepted: events.length }, corsH)
  }

  if (!c.allow) {
    return { statusCode: 403, body: 'Forbidden', headers: {} }
  }
  return json(404, { error: 'not_found' }, corsH)
}
