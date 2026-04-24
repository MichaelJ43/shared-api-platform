import { describe, expect, it } from 'vitest'
import { authBody, registerBody } from './authValidation'

describe('authBody', () => {
  it('normalizes and accepts a valid email', () => {
    const r = authBody.safeParse({ email: '  User@Example.COM ', password: 'anything' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.email).toBe('user@example.com')
    }
  })

  it('rejects a non-email username', () => {
    const r = authBody.safeParse({ email: 'not-an-email', password: 'anything' })
    expect(r.success).toBe(false)
  })
})

describe('registerBody', () => {
  it('accepts a valid email and strong password', () => {
    const r = registerBody.safeParse({ email: 'new@example.com', password: 'Valid1!@#ab12' })
    expect(r.success).toBe(true)
  })

  it('rejects a weak password at the HTTP validation boundary', () => {
    const r = registerBody.safeParse({ email: 'new@example.com', password: 'short' })
    expect(r.success).toBe(false)
  })
})
