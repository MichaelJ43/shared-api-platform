/**
 * Allow-list: https only; host is `baseHost`, or `api.<baseHost>`, or `*.<baseHost>`.
 * Rejects other hosts, schemes, and bare IPs.
 */
export function isAllowedReturnUrl(redirect: string, baseHost: string): boolean {
  const b = baseHost.trim().toLowerCase()
  if (!b) {
    return false
  }
  let u: URL
  try {
    u = new URL(redirect)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') {
    return false
  }
  const h = u.hostname.toLowerCase()
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) {
    return false
  }
  if (h === b) {
    return true
  }
  if (h === `api.${b}`) {
    return true
  }
  if (h.endsWith(`.${b}`) && h.length > b.length + 1) {
    return true
  }
  return false
}

export function firstAllowedOrDefault(redirect: string | undefined, baseHost: string, defaultUrl: string): string {
  if (redirect && isAllowedReturnUrl(redirect, baseHost)) {
    return redirect
  }
  if (defaultUrl && isAllowedReturnUrl(defaultUrl, baseHost)) {
    return defaultUrl
  }
  return `https://api.${baseHost}/health`
}
