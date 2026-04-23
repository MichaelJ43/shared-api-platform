import { describe, expect, it } from 'vitest'
import { validatePasswordForEmail } from './passwordPolicy'

describe('validatePasswordForEmail', () => {
  it('accepts a strong password', () => {
    const r = validatePasswordForEmail('a@b.com', 'Aa1!abcdabcd')
    expect(r.ok).toBe(true)
  })
  it('rejects short', () => {
    const r = validatePasswordForEmail('a@b.com', 'Aa1!short')
    expect(r.ok).toBe(false)
  })
  it('rejects short password and trivial matches', () => {
    const r = validatePasswordForEmail('a@b.com', 'a@b.com')
    expect(r.ok).toBe(false)
  })
})
