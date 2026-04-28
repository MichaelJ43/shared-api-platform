/**
 * Offline IP → rough location using official ip2region **xdb** (via `ip2region.js`).
 * Locale: China → Chinese labels; other countries → English (upstream dataset policy).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IPv4, IPv6, loadContentFromFile, newWithBuffer } from 'ip2region.js'
import type { Searcher } from 'ip2region.js'

export type GeoParts = { country: string; province: string; city: string; isp: string }

function resolveXdbDir(): string {
  const env = process.env.IP2REGION_XDB_DIR?.trim()
  if (env) {
    return env
  }
  // Lambda zip: handler.js next to data/ip2region/
  const fromHandler = join(__dirname, 'data/ip2region')
  if (existsSync(join(fromHandler, 'ip2region_v4.xdb'))) {
    return fromHandler
  }
  // Tests / local src: geoFromIp lives in src/
  return join(__dirname, '..', 'data', 'ip2region')
}

function parseRegion(region: string): GeoParts | null {
  const parts = region.split('|')
  if (parts.length < 4) {
    return null
  }
  const norm = (s: string) => (s && s !== '0' ? s.trim() : '')
  return {
    country: norm(parts[0] ?? ''),
    province: norm(parts[1] ?? ''),
    city: norm(parts[2] ?? ''),
    isp: norm(parts[3] ?? ''),
  }
}

let searcherV4: Searcher | null | undefined
let searcherV6: Searcher | null | undefined

function getSearchers(): { v4: Searcher | null; v6: Searcher | null } {
  if (searcherV4 !== undefined) {
    return { v4: searcherV4, v6: searcherV6 ?? null }
  }
  searcherV4 = null
  searcherV6 = null
  const dir = resolveXdbDir()
  const v4path = join(dir, 'ip2region_v4.xdb')
  const v6path = join(dir, 'ip2region_v6.xdb')
  try {
    if (existsSync(v4path)) {
      searcherV4 = newWithBuffer(IPv4, loadContentFromFile(v4path))
    }
    if (existsSync(v6path)) {
      searcherV6 = newWithBuffer(IPv6, loadContentFromFile(v6path))
    }
  } catch {
    searcherV4 = null
    searcherV6 = null
  }
  return { v4: searcherV4, v6: searcherV6 }
}

export async function lookupGeo(sourceIp: string | undefined): Promise<GeoParts | null> {
  if (!sourceIp?.trim()) {
    return null
  }
  const ip = sourceIp.trim()
  const { v4, v6 } = getSearchers()
  const isV6 = ip.includes(':')
  const searcher = isV6 ? v6 : v4
  if (!searcher) {
    return null
  }
  try {
    const region = await searcher.search(ip)
    if (!region || typeof region !== 'string') {
      return null
    }
    return parseRegion(region)
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
