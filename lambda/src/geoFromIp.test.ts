import { describe, expect, it } from 'vitest'
import { formatLocationLabel, lookupGeo } from './geoFromIp'

describe('geoFromIp', () => {
  it('lookup returns object or null for garbage', async () => {
    const r = await lookupGeo('256.256.256.256')
    expect(r === null || typeof r === 'object').toBe(true)
  })
  it('US-ish public IP uses English region strings when xdb is present', async () => {
    const r = await lookupGeo('8.8.8.8')
    if (r && r.country) {
      expect(r.country).not.toMatch(/[\u4e00-\u9fff]/)
    }
  })
  it('formats city and province', () => {
    expect(formatLocationLabel({ city: 'Sydney', province: 'NSW', country: 'AU', isp: '' })).toBe(
      'Sydney, NSW',
    )
  })
  it('formats province and country when no city', () => {
    expect(formatLocationLabel({ city: '', province: 'CA', country: 'US', isp: '' })).toBe('CA, US')
  })
})
