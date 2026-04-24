#!/usr/bin/env node
/**
 * Create a user in AUTH_USERS (Argon2id hash, same policy as API).
 * Usage: AUTH_USERS_TABLE_NAME=... AWS_REGION=... node scripts/create-user.mjs [--admin] <email>
 * Password: read from stdin (line) or env CREATE_USER_PASSWORD (not recommended).
 * Use --admin to set role=admin for analytics dashboard API access.
 */
import { createInterface } from 'node:readline'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { ulid } from 'ulid'
import * as argon2 from 'argon2'

const table = process.env.AUTH_USERS_TABLE_NAME
const region = process.env.AWS_REGION ?? 'us-east-1'
if (!table) {
  console.error('Set AUTH_USERS_TABLE_NAME')
  process.exit(1)
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }))

async function readLine(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a) }))
}

function normEmail(e) {
  return e.trim().toLowerCase()
}

const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}|;:,.?/]/
function validate(email, password) {
  if (password.length < 12 || password.length > 128) {
    return 'length'
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !SPECIAL_RE.test(password)) {
    return 'classes'
  }
  const n = normEmail(email)
  const at = n.indexOf('@')
  const local = at > 0 ? n.slice(0, at) : n
  const pl = password.toLowerCase()
  if (pl === n || pl === local) {
    return 'email'
  }
  return null
}

async function main() {
  const argv = process.argv.slice(2)
  const isAdmin = argv.includes('--admin')
  const posArgs = argv.filter((a) => a !== '--admin')
  const email = normEmail(posArgs[0] ?? (await readLine('Email: ')))
  if (!email || !email.includes('@')) {
    console.error('Invalid email')
    process.exit(1)
  }
  let password = process.env.CREATE_USER_PASSWORD
  if (!password) {
    password = await readLine('Password: ')
  }
  const err = validate(email, password)
  if (err) {
    console.error('Password does not meet policy:', err)
    process.exit(1)
  }
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
  const userId = ulid()
  const createdAt = new Date().toISOString()
  const item = { email, userId, passwordHash: hash, createdAt, ...(isAdmin ? { role: 'admin' } : {}) }
  await doc.send(
    new PutCommand({
      TableName: table,
      Item: item,
      ConditionExpression: 'attribute_not_exists(email)',
    }),
  )
  console.log('Created user', email, userId, isAdmin ? '(admin)' : '')
}

main().catch((e) => {
  if (e.name === 'ConditionalCheckFailedException') {
    console.error('User already exists')
  } else {
    console.error(e)
  }
  process.exit(1)
})
