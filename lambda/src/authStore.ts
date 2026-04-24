import { GetCommand, DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { documentClient } from './dynamoClient'
import { randomBytes } from 'node:crypto'
import { ulid } from 'ulid'
import * as argon2 from 'argon2'
import { validatePasswordForEmail } from './passwordPolicy'

const USERS = () => process.env.AUTH_USERS_TABLE_NAME ?? ''
const SESSIONS = () => process.env.AUTH_SESSIONS_TABLE_NAME ?? ''
const ttlSec = () => parseInt(process.env.AUTH_SESSION_TTL_SECONDS ?? '604800', 10) || 604800

/** Stored on the user item in DynamoDB for dashboard / admin API access. */
export const ADMIN_ROLE = 'admin' as const

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type AuthUser = {
  email: string
  userId: string
  passwordHash: string
  createdAt: string
  /** Set to {@link ADMIN_ROLE} in DynamoDB (or via create-user --admin) for admin-only routes. */
  role?: typeof ADMIN_ROLE
}

export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return user?.role === ADMIN_ROLE
}

export function effectiveRole(user: AuthUser): 'admin' | 'user' {
  return isAdminUser(user) ? 'admin' : 'user'
}

export type SessionRow = {
  userId: string
  email: string
  expiresAt: number
}

function usersTable() {
  const t = USERS()
  if (!t) {
    throw new Error('server_misconfiguration')
  }
  return t
}
function sessionsTable() {
  const t = SESSIONS()
  if (!t) {
    throw new Error('server_misconfiguration')
  }
  return t
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const e = normalizeEmail(email)
  const r = await documentClient.send(
    new GetCommand({ TableName: usersTable(), Key: { email: e } }),
  )
  if (!r.Item) {
    return null
  }
  const o = r.Item as Record<string, unknown>
  const roleRaw = o.role
  const role =
    typeof roleRaw === 'string' && roleRaw === ADMIN_ROLE ? ADMIN_ROLE : undefined
  return {
    email: o.email as string,
    userId: o.userId as string,
    passwordHash: o.passwordHash as string,
    createdAt: o.createdAt as string,
    ...(role ? { role } : {}),
  }
}

export async function createUser(email: string, password: string): Promise<{ ok: true; user: AuthUser } | { ok: false; error: 'exists' | 'invalid_password' }> {
  const e = normalizeEmail(email)
  const v = validatePasswordForEmail(e, password)
  if (!v.ok) {
    return { ok: false, error: 'invalid_password' }
  }
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
  const user: AuthUser = {
    email: e,
    userId: ulid(),
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  }
  try {
    await documentClient.send(
      new PutCommand({
        TableName: usersTable(),
        Item: { ...user } as Record<string, unknown>,
        ConditionExpression: 'attribute_not_exists(email)',
      }),
    )
  } catch (err: unknown) {
    const e = err as { name?: string }
    if (e.name === 'ConditionalCheckFailedException') {
      return { ok: false, error: 'exists' }
    }
    throw err
  }
  return { ok: true, user }
}

export async function verifyPassword(user: AuthUser, password: string): Promise<boolean> {
  return argon2.verify(user.passwordHash, password)
}

export async function createSession(user: AuthUser): Promise<{ sessionId: string; maxAge: number; expiresAt: number; ttl: number }> {
  const sessionId = randomBytes(32).toString('hex')
  const maxAge = ttlSec()
  const now = Date.now()
  const expiresAt = now + maxAge * 1000
  const ttl = Math.floor(expiresAt / 1000)
  await documentClient.send(
    new PutCommand({
      TableName: sessionsTable(),
      Item: {
        sessionId,
        userId: user.userId,
        email: user.email,
        expiresAt,
        ttl,
      } as Record<string, unknown>,
    }),
  )
  return { sessionId, maxAge, expiresAt, ttl }
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const r = await documentClient.send(
    new GetCommand({ TableName: sessionsTable(), Key: { sessionId } }),
  )
  if (!r.Item) {
    return null
  }
  const o = r.Item as Record<string, unknown>
  const ex = o.expiresAt as number
  if (typeof ex === 'number' && ex < Date.now()) {
    return null
  }
  return { userId: o.userId as string, email: o.email as string, expiresAt: ex }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await documentClient.send(
    new DeleteCommand({ TableName: sessionsTable(), Key: { sessionId } }),
  )
}

export async function hashPasswordForScript(email: string, password: string): Promise<string> {
  const e = normalizeEmail(email)
  const v = validatePasswordForEmail(e, password)
  if (!v.ok) {
    throw new Error(`Invalid password: ${v.code}`)
  }
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
}
