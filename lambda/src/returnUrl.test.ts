import { describe, expect, it } from 'vitest'
import { firstAllowedOrDefault, isAllowedReturnUrl } from './returnUrl'

describe('isAllowedReturnUrl', () => {
  it('allows apex and subdomains of base', () => {
    expect(isAllowedReturnUrl('https://michaelj43.dev/', 'michaelj43.dev')).toBe(true)
    expect(isAllowedReturnUrl('https://api.michaelj43.dev/x', 'michaelj43.dev')).toBe(true)
    expect(isAllowedReturnUrl('https://auth.michaelj43.dev/', 'michaelj43.dev')).toBe(true)
  })
  it('rejects other hosts and http', () => {
    expect(isAllowedReturnUrl('https://evil.com/', 'michaelj43.dev')).toBe(false)
    expect(isAllowedReturnUrl('http://michaelj43.dev/', 'michaelj43.dev')).toBe(false)
  })
})

describe('firstAllowedOrDefault', () => {
  it('uses return when valid', () => {
    const d = firstAllowedOrDefault('https://auth.michaelj43.dev/', 'michaelj43.dev', '')
    expect(d).toBe('https://auth.michaelj43.dev/')
  })
})
