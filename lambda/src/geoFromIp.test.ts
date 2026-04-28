import { describe, expect, it } from 'vitest'
import { formatLocationLabel, lookupGeo } from './geoFromIp'

describe('geoFromIp', () => {
  it('lookup returns object or null for garbage', () => {
    const r = lookupGeo('256.256.256.256')
    expect(r === null || typeof r === 'object').toBe(true)
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
