import { describe, expect, it } from 'vitest'
import { hashClientIp, getClientIp } from './hashIp'

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
