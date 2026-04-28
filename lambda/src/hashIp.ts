import { createHmac } from 'node:crypto'

/**
 * HMAC-SHA256 of client IP. Returns empty string if secret not configured.
 */
export function hashClientIp(
  sourceIp: string | undefined,
  ipHashSecret: string | undefined,
): string {
  if (!sourceIp || !ipHashSecret) {
    return ''
  }
  return createHmac('sha256', ipHashSecret).update(sourceIp, 'utf8').digest('hex')
}

export function getClientIp(event: {
  requestContext?: { http?: { sourceIp?: string } }
}): string | undefined {
  return event.requestContext?.http?.sourceIp
}

/** Last IPv4 octet removed; IPv6 truncated to first four hexdigit groups (coarse, non-reversible). */
export function maskClientIp(sourceIp: string | undefined): string {
  if (!sourceIp?.trim()) {
    return ''
  }
  const ip = sourceIp.trim()
  if (ip.toLowerCase() === 'unknown') {
    return ''
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip)
  if (v4) {
    return `${v4[1]}.${v4[2]}.${v4[3]}.*`
  }
  if (ip.includes(':')) {
    const segments = ip.split(':').filter((s) => s.length > 0)
    if (segments.length >= 4) {
      return `${segments.slice(0, 4).join(':')}::**`
    }
    if (segments.length > 0) {
      return `${segments.slice(0, Math.min(4, segments.length)).join(':')}::**`
    }
  }
  return ''
}
