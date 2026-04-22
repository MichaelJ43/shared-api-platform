import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { ulid } from 'ulid'
import type { z } from 'zod'
import type { eventSchema } from './schemas'

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

type Event = z.infer<typeof eventSchema>

export type EventRow = {
  appId: string
  event: Event
  serverTimestamp: number
  serverTimestampDayUtc: string
  ingestId: string
  ipHash: string
  userAgent: string
}

function buildItem(
  p: EventRow,
): { pk: string; sk: string; [key: string]: unknown } {
  const { appId, event, serverTimestamp, serverTimestampDayUtc, ingestId, ipHash, userAgent } = p
  const pk = `APP#${appId}#DAY#${serverTimestampDayUtc}`
  const sk = `${serverTimestamp}#${ingestId}`

  const offsetSec = parseInt(process.env.EVENTS_TTL_OFFSET_SECONDS ?? '0', 10)
  const ttlValue =
    Number.isFinite(offsetSec) && offsetSec > 0
      ? Math.floor(serverTimestamp / 1000) + offsetSec
      : undefined

  const out: Record<string, unknown> = {
    pk,
    sk,
    appId,
    sessionId: event.sessionId,
    eventType: event.eventType,
    path: event.path,
    clientTimestamp: event.clientTimestamp,
    serverTimestamp,
    ingestId,
  }
  if (event.context !== undefined) {
    out.properties = event.context
  }
  if (ipHash) {
    out.ipHash = ipHash
  }
  if (userAgent) {
    out.userAgent = userAgent
  }
  if (ttlValue !== undefined) {
    out.ttl = ttlValue
  }
  return out as { pk: string; sk: string; [key: string]: unknown }
}

export async function putEvent(tableName: string, row: EventRow): Promise<void> {
  const item = buildItem(row)
  await documentClient.send(
    new PutCommand({ TableName: tableName, Item: item as Record<string, unknown> }),
  )
}

export async function putEventBatch(tableName: string, rows: EventRow[]): Promise<void> {
  for (const chunk of chunkArray(rows, 25)) {
    const requestItems = {
      [tableName]: chunk.map((r) => ({
        PutRequest: { Item: buildItem(r) as Record<string, unknown> },
      })),
    }
    await documentClient.send(new BatchWriteCommand({ RequestItems: requestItems }))
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

export function newIngestId(): string {
  return ulid()
}

export function dayUtcString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

