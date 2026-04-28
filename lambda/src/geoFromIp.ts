/**
 * Offline IP → rough city/region using ip2region (embedded DB; labels may be localized).
 */
import IP2Region from 'ip2region'

export type GeoParts = { country: string; province: string; city: string; isp: string }

let ip2: InstanceType<typeof IP2Region> | undefined

function getIp2(): InstanceType<typeof IP2Region> | undefined {
  if (ip2 !== undefined) {
    return ip2
  }
  try {
    ip2 = new IP2Region()
    return ip2
  } catch {
    return undefined
  }
}

export function lookupGeo(sourceIp: string | undefined): GeoParts | null {
  if (!sourceIp?.trim()) {
    return null
  }
  const ip = sourceIp.trim()
  const q = getIp2()
  if (!q) {
    return null
  }
  try {
    const r = q.search(ip) as GeoParts | null
    if (!r || typeof r !== 'object') {
      return null
    }
    return r
  } catch {
    return null
  }
}

const PRIVATE_MARKER = new Set(['内网IP', '局域网'])

export function formatLocationLabel(r: GeoParts | null): string {
  if (!r) {
    return ''
  }
  const city = (r.city ?? '').trim()
  const province = (r.province ?? '').trim()
  const country = (r.country ?? '').trim()
  if (PRIVATE_MARKER.has(city) || PRIVATE_MARKER.has(province)) {
    return ''
  }
  if (!country && !province && !city) {
    return ''
  }
  if (city && province) {
    return `${city}, ${province}`
  }
  if (city && country && city !== country) {
    return `${city}, ${country}`
  }
  if (province && country) {
    return `${province}, ${country}`
  }
  if (city) {
    return city
  }
  if (province) {
    return province
  }
  if (country) {
    return country
  }
  return ''
}
