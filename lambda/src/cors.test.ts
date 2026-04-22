import { describe, expect, it } from 'vitest'
import { getCorsHeaders, withCors } from './cors'

describe('getCorsHeaders', () => {
  it('allows apex michaelj43.dev', () => {
    const r = getCorsHeaders('https://michaelj43.dev', 'michaelj43.dev')
    expect(r.allow).toBe(true)
    expect(r.headers['access-control-allow-origin']).toBe('https://michaelj43.dev')
  })
  it('allows subdomains', () => {
    const r = getCorsHeaders('https://echo.michaelj43.dev', 'michaelj43.dev')
    expect(r.allow).toBe(true)
  })
  it('rejects other domains', () => {
    const r = getCorsHeaders('https://evil.com', 'michaelj43.dev')
    expect(r.allow).toBe(false)
  })
  it('rejects lookalike domain', () => {
    const r = getCorsHeaders('https://notmichaelj43.dev', 'michaelj43.dev')
    expect(r.allow).toBe(false)
  })
  it('rejects http', () => {
    const r = getCorsHeaders('http://michaelj43.dev', 'michaelj43.dev')
    expect(r.allow).toBe(false)
  })
})

describe('withCors localhost', () => {
  it('matches explicit localhost allow list', () => {
    const r = withCors('http://localhost:5173', 'http://localhost:5173', 'michaelj43.dev')
    expect(r.allow).toBe(true)
  })
  it('fails if origin not in list', () => {
    const r = withCors('http://localhost:5173', 'http://localhost:4000', 'michaelj43.dev')
    expect(r.allow).toBe(false)
  })
})
