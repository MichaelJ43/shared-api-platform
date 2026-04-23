const SESSION = 'sap_session'

export const SESSION_COOKIE_NAME = SESSION

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!cookieHeader) {
    return out
  }
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) {
      continue
    }
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k) {
      out[k] = decodeURIComponent(v)
    }
  }
  return out
}

export function buildSessionCookie(
  value: string | null,
  maxAgeSec: number,
  domain: string,
): string {
  const d = domain.trim().toLowerCase()
  if (!d) {
    return ''
  }
  const base = `Path=/; HttpOnly; Secure; SameSite=Lax; Domain=${d}`
  if (value === null) {
    return `${SESSION}=; Max-Age=0; ${base}`
  }
  return `${SESSION}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; ${base}`
}
