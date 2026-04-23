import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { documentClient } from './dynamoClient'

const table = () => process.env.EVENTS_TABLE_NAME ?? ''

function pkFor(appId: string, dayUtc: string): string {
  return `APP#${appId}#DAY#${dayUtc}`
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
