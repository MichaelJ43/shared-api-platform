import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { documentClient } from './dynamoClient'
import { dayUtcString } from './persist'

const table = () => process.env.EVENTS_TABLE_NAME ?? ''

/** Upper bound for `sk` for a given serverTimestamp ms (sort key is `ms#ulid`). */
const SK_ULID_MAX = 'ZZZZZZZZZZZZZZZZZZZZZZZZ'

const PK_APP_DAY_RE = /^APP#([^#]+)#DAY#\d{4}-\d{2}-\d{2}$/

function pkFor(appId: string, dayUtc: string): string {
  return `APP#${appId}#DAY#${dayUtc}`
}

function startOfUtcDayMs(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
}

function utcDaysInclusive(fromMs: number, toMs: number): string[] {
  const days: string[] = []
  let t = startOfUtcDayMs(fromMs)
  const endDayStart = startOfUtcDayMs(toMs)
  while (t <= endDayStart) {
    days.push(dayUtcString(t))
    t += 86_400_000
  }
  return days
}

export type AdminListResult = { items: Record<string, unknown>[]; nextCursor: string | null }

export async function queryEventsByAppAndDay(
  appId: string,
  dayUtc: string,
  limit: number,
  cursor: string | null,
): Promise<AdminListResult> {
  const t = table()
  if (!t) {
    throw new Error('server_misconfiguration')
  }
  const pk = pkFor(appId, dayUtc)
  const exclusiveStartKey = (() => {
    if (!cursor) {
      return undefined
    }
    try {
      return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>
    } catch {
      return undefined
    }
  })()

  const r = await documentClient.send(
    new QueryCommand({
      TableName: t,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk } as Record<string, unknown>,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: false,
    }),
  )
  const items = (r.Items ?? []) as Record<string, unknown>[]
  let nextCursor: string | null = null
  if (r.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(r.LastEvaluatedKey), 'utf8').toString('base64url')
  }
  return { items, nextCursor }
}

async function queryPartitionSlice(
  appId: string,
  dayUtc: string,
  sliceFromMs: number,
  sliceToMs: number,
  maxItems: number,
): Promise<Record<string, unknown>[]> {
  const t = table()
  if (!t) {
    throw new Error('server_misconfiguration')
  }
  const pk = pkFor(appId, dayUtc)
  const minSk = `${sliceFromMs}#`
  const maxSk = `${sliceToMs}#${SK_ULID_MAX}`
  const out: Record<string, unknown>[] = []
  let startKey: Record<string, unknown> | undefined
  do {
    const need = maxItems - out.length
    if (need <= 0) {
      break
    }
    const r = await documentClient.send(
      new QueryCommand({
        TableName: t,
        KeyConditionExpression: 'pk = :pk AND sk BETWEEN :minsk AND :maxsk',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':minsk': minSk,
          ':maxsk': maxSk,
        } as Record<string, unknown>,
        ExclusiveStartKey: startKey,
        ScanIndexForward: false,
        Limit: Math.min(100, need),
      }),
    )
    out.push(...((r.Items ?? []) as Record<string, unknown>[]))
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined
  } while (startKey && out.length < maxItems)
  return out
}

/** Query events for [fromMs, toMs] (UTC, inclusive by serverTimestamp). Paginates within each day partition. */
export async function queryEventsByAppAndTimeRange(
  appId: string,
  fromMs: number,
  toMs: number,
  limit: number,
): Promise<AdminListResult> {
  let a = fromMs
  let b = toMs
  if (a > b) {
    ;[a, b] = [b, a]
  }
  const firstDay = dayUtcString(a)
  const lastDay = dayUtcString(b)
  const days = utcDaysInclusive(a, b)
  const collected: Record<string, unknown>[] = []
  for (const day of days) {
    if (collected.length >= limit) {
      break
    }
    const sliceFrom = day === firstDay ? a : Date.parse(`${day}T00:00:00.000Z`)
    const sliceTo = day === lastDay ? b : Date.parse(`${day}T23:59:59.999Z`)
    const part = await queryPartitionSlice(appId, day, sliceFrom, sliceTo, limit - collected.length)
    collected.push(...part)
  }
  collected.sort((x, y) => {
    const tx = Number(x.serverTimestamp) || 0
    const ty = Number(y.serverTimestamp) || 0
    return ty - tx
  })
  return { items: collected.slice(0, limit), nextCursor: null }
}

/**
 * Best-effort distinct appIds from event partition keys (bounded scan). For large tables, results may be incomplete.
 */
export async function listDistinctAppIds(maxItemsToScan: number): Promise<string[]> {
  const t = table()
  if (!t) {
    throw new Error('server_misconfiguration')
  }
  const seen = new Set<string>()
  let scanned = 0
  let startKey: Record<string, unknown> | undefined
  while (scanned < maxItemsToScan) {
    const batch = Math.min(100, maxItemsToScan - scanned)
    const r = await documentClient.send(
      new ScanCommand({
        TableName: t,
        ProjectionExpression: 'pk',
        Limit: batch,
        ExclusiveStartKey: startKey,
      }),
    )
    for (const it of r.Items ?? []) {
      const pk = String((it as Record<string, unknown>).pk ?? '')
      const m = pk.match(PK_APP_DAY_RE)
      if (m) {
        seen.add(m[1])
      }
    }
    scanned += r.Items?.length ?? 0
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined
    if (!startKey) {
      break
    }
  }
  return [...seen].sort((x, y) => x.localeCompare(y))
}
