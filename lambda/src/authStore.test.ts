import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const send = vi.fn()

vi.mock('./dynamoClient', () => ({
  documentClient: {
    send: (cmd: unknown) => send(cmd),
  },
}))

vi.mock('argon2', () => ({
  hash: vi.fn().mockImplementation(() => Promise.resolve('argon-hash')),
  verify: vi.fn().mockImplementation(() => Promise.resolve(true)),
  argon2id: 2,
}))

import * as argon2 from 'argon2'
import {
  createSession,
  createUser,
  deleteSession,
  getSession,
  getUserByEmail,
  hashPasswordForScript,
  normalizeEmail,
  verifyPassword,
} from './authStore'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  A@B.COM ')).toBe('a@b.com')
  })
})

describe('getUserByEmail', () => {
  beforeEach(() => {
    process.env.AUTH_USERS_TABLE_NAME = 'users-t'
    process.env.AUTH_SESSIONS_TABLE_NAME = 'sess-t'
    send.mockReset()
  })

  it('throws when users table is not configured', async () => {
    delete process.env.AUTH_USERS_TABLE_NAME
    process.env.AUTH_SESSIONS_TABLE_NAME = 'sess-t'
    await expect(getUserByEmail('x@y.com')).rejects.toThrow('server_misconfiguration')
  })

  it('returns null when no item', async () => {
    send.mockResolvedValueOnce({})
    const u = await getUserByEmail('x@y.com')
    expect(u).toBeNull()
    expect(send).toHaveBeenCalledWith(expect.any(GetCommand))
  })

  it('returns mapped user', async () => {
    send.mockResolvedValueOnce({
      Item: {
        email: 'a@b.com',
        userId: 'u1',
        passwordHash: 'h',
        createdAt: 't',
      },
    })
    const u = await getUserByEmail('a@b.com')
    expect(u).toEqual({ email: 'a@b.com', userId: 'u1', passwordHash: 'h', createdAt: 't' })
  })
})

describe('createUser', () => {
  beforeEach(() => {
    process.env.AUTH_USERS_TABLE_NAME = 'users-t'
    process.env.AUTH_SESSIONS_TABLE_NAME = 'sess-t'
    send.mockReset()
  })

  const goodPw = 'Valid1!@#ab12'

  it('rejects invalid password', async () => {
    const r = await createUser('a@b.com', 'short')
    expect(r).toEqual({ ok: false, error: 'invalid_password' })
    expect(send).not.toHaveBeenCalled()
  })

  it('puts user on success', async () => {
    send.mockResolvedValueOnce({})
    const r = await createUser('new@b.com', goodPw)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.user.email).toBe('new@b.com')
      expect(r.user.userId).toBeDefined()
      expect(r.user.passwordHash).toBe('argon-hash')
    }
    expect(send).toHaveBeenCalledWith(expect.any(PutCommand))
  })

  it('returns exists on conditional failure', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('cc'), { name: 'ConditionalCheckFailedException' }))
    const r = await createUser('new@b.com', goodPw)
    expect(r).toEqual({ ok: false, error: 'exists' })
  })
})

describe('verifyPassword', () => {
  it('delegates to argon2', async () => {
    const user = { email: 'a', userId: '1', passwordHash: 'h', createdAt: 't' }
    await verifyPassword(user, 'pw')
    expect(argon2.verify).toHaveBeenCalledWith('h', 'pw')
  })
})

describe('createSession / getSession / deleteSession', () => {
  beforeEach(() => {
    process.env.AUTH_USERS_TABLE_NAME = 'users-t'
    process.env.AUTH_SESSIONS_TABLE_NAME = 'sess-t'
    process.env.AUTH_SESSION_TTL_SECONDS = '10'
    send.mockReset()
  })

  it('createSession puts row', async () => {
    send.mockResolvedValueOnce({})
    const u = { email: 'a@b.com', userId: 'u', passwordHash: 'h', createdAt: 't' }
    const s = await createSession(u)
    expect(s.sessionId).toMatch(/^[0-9a-f]{64}$/)
    expect(send).toHaveBeenCalledWith(expect.any(PutCommand))
  })

  it('getSession returns null for missing or expired', async () => {
    send.mockResolvedValueOnce({})
    expect(await getSession('sid')).toBeNull()

    send.mockResolvedValueOnce({ Item: { userId: 'u', email: 'a@b.com', expiresAt: Date.now() - 1000 } })
    expect(await getSession('sid')).toBeNull()
  })

  it('getSession returns row when valid', async () => {
    const ex = Date.now() + 60_000
    send.mockResolvedValueOnce({ Item: { userId: 'u', email: 'a@b.com', expiresAt: ex } })
    const s = await getSession('sid')
    expect(s).toEqual({ userId: 'u', email: 'a@b.com', expiresAt: ex })
  })

  it('deleteSession sends DeleteCommand', async () => {
    send.mockResolvedValueOnce({})
    await deleteSession('sid')
    expect(send).toHaveBeenCalledWith(expect.any(DeleteCommand))
  })
})

describe('hashPasswordForScript', () => {
  it('rejects invalid password', async () => {
    await expect(hashPasswordForScript('a@b.com', 'bad')).rejects.toThrow(/Invalid password/)
  })

  it('returns hash for valid password', async () => {
    const h = await hashPasswordForScript('a@b.com', 'Valid1!@#ab12')
    expect(h).toBe('argon-hash')
  })
})
