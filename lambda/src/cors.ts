/**
 * Returns Access-Control response headers for an HTTP API v2 (Lambda) response.
 * Allows HTTPS origins on `baseHost` and any `*.${baseHost}`; apex `https://${baseHost}`.
 */
export function getCorsHeaders(
  requestOrigin: string | undefined,
  baseHost: string,
): { headers: Record<string, string>; allow: boolean; origin: string | null } {
  if (!requestOrigin || !baseHost) {
    return { headers: {}, allow: false, origin: null }
  }
  const trimmed = baseHost.trim().toLowerCase()
  if (!trimmed) {
    return { headers: {}, allow: false, origin: null }
  }
  let u: URL
  try {
    u = new URL(requestOrigin)
  } catch {
    return { headers: {}, allow: false, origin: null }
  }
  if (u.protocol !== 'https:') {
    return { headers: {}, allow: false, origin: null }
  }
  const host = u.hostname.toLowerCase()
  if (host !== trimmed && !host.endsWith(`.${trimmed}`)) {
    return { headers: {}, allow: false, origin: null }
  }
  return {
    allow: true,
    origin: requestOrigin,
    headers: {
      'access-control-allow-origin': requestOrigin,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,origin',
      'access-control-max-age': '600',
      vary: 'Origin',
    },
  }
}

export function withCors(
  allowLocalhost: string | undefined,
  requestOrigin: string | undefined,
  baseHost: string,
): { headers: Record<string, string>; allow: boolean; origin: string | null } {
  if (allowLocalhost) {
    const list = allowLocalhost.split(',').map((s) => s.trim()).filter(Boolean)
    if (requestOrigin && list.includes(requestOrigin)) {
      return {
        allow: true,
        origin: requestOrigin,
        headers: {
          'access-control-allow-origin': requestOrigin,
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type,origin',
          'access-control-max-age': '600',
          vary: 'Origin',
        },
      }
    }
  }
  return getCorsHeaders(requestOrigin, baseHost)
}
