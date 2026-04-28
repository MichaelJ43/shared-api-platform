import { describe, expect, it } from 'vitest'
import { hashClientIp, getClientIp, maskClientIp } from './hashIp'

describe('hashClientIp', () => {
  it('returns empty without secret or ip', () => {
    expect(hashClientIp('1.2.3.4', undefined)).toBe('')
    expect(hashClientIp(undefined, 'secret')).toBe('')
  })
  it('is stable for same inputs', () => {
    const a = hashClientIp('1.2.3.4', 'test-secret')
    const b = hashClientIp('1.2.3.4', 'test-secret')
    expect(a).toBe(b)
    expect(a.length).toBe(64)
  })
})

describe('getClientIp', () => {
  it('reads sourceIp', () => {
    expect(
      getClientIp({
        requestContext: { http: { sourceIp: '1.1.1.1' } },
      }),
    ).toBe('1.1.1.1')
  })
})

describe('maskClientIp', () => {
  it('masks ipv4 last octet', () => {
    expect(maskClientIp('192.168.0.44')).toBe('192.168.0.*')
    expect(maskClientIp('1.1.1.1')).toBe('1.1.1.*')
  })
  it('truncates ipv6', () => {
    expect(maskClientIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3:8a2e::**')
  })
  it('handles empty', () => {
    expect(maskClientIp(undefined)).toBe('')
    expect(maskClientIp('')).toBe('')
    expect(maskClientIp('unknown')).toBe('')
  })
})
