import { describe, expect, it } from 'vitest'
import { buildSessionCookie, parseCookies, SESSION_COOKIE_NAME } from './cookieUtil'

describe('parseCookies', () => {
  it('returns empty for missing header', () => {
    expect(parseCookies(undefined)).toEqual({})
  })

  it('parses multiple cookies and decodes values', () => {
    expect(
      parseCookies('a=1; b=hello%20world; c='),
    ).toEqual({ a: '1', b: 'hello world', c: '' })
  })

  it('ignores parts without =', () => {
    expect(parseCookies('nodash; k=v')).toEqual({ k: 'v' })
  })
})

describe('buildSessionCookie', () => {
  it('returns empty when domain is empty', () => {
    expect(buildSessionCookie('x', 60, '  ')).toBe('')
  })

  it('clears session when value is null', () => {
    const c = buildSessionCookie(null, 0, 'Example.com')
    expect(c).toContain('Max-Age=0')
    expect(c).toContain('Domain=example.com')
    expect(c).toContain(`${SESSION_COOKIE_NAME}=;`)
  })

  it('sets session with encoded value', () => {
    const c = buildSessionCookie('abc def', 3600, 'michaelj43.dev')
    expect(c).toContain('Domain=michaelj43.dev')
    expect(c).toMatch(/Max-Age=3600/)
    expect(c).toContain(encodeURIComponent('abc def'))
  })
})
