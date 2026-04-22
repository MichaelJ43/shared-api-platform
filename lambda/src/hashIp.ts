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
