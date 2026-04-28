import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class X {},
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send }),
  },
  PutCommand: class Put {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
  BatchWriteCommand: class Bw {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
}))

import { dayUtcString, newIngestId, putEvent, putEventBatch } from './persist'

beforeEach(() => {
  send.mockReset()
  send.mockResolvedValue({})
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('putEvent & batch', () => {
  afterEach(() => {
    delete process.env.EVENTS_TTL_OFFSET_SECONDS
  })
  it('sends put with expected pk/sk and ttl when EVENTS_TTL_OFFSET_SECONDS is set', async () => {
    process.env.EVENTS_TTL_OFFSET_SECONDS = '86400'
    await putEvent('tbl', {
      appId: 'a',
      event: {
        appId: 'a',
        sessionId: 's',
        eventType: 'p',
        path: '/',
        clientTimestamp: 0,
        context: { k: 1 },
      },
      serverTimestamp: 2000,
      serverTimestampDayUtc: '2026-01-01',
      ingestId: 'id1',
      ipHash: 'h',
      ipMasked: '',
      geoLabel: '',
      userAgent: 'ua',
    })
    const [cmd] = send.mock.calls[0] as [{ input: { TableName: string; Item: { pk: string; sk: string; ttl?: number } } }]
    expect(cmd.input.Item.ttl).toBe(2 + 86400)
  })

  it('sends put with expected pk/sk (no ttl when offset 0)', async () => {
    await putEvent('tbl', {
      appId: 'a',
      event: {
        appId: 'a',
        sessionId: 's',
        eventType: 'p',
        path: '/',
        clientTimestamp: 0,
        context: { k: 1 },
      },
      serverTimestamp: 1,
      serverTimestampDayUtc: '2026-01-01',
      ingestId: 'id1',
      ipHash: 'h',
      ipMasked: '',
      geoLabel: '',
      userAgent: 'ua',
    })
    expect(send).toHaveBeenCalledTimes(1)
    const [cmd] = send.mock.calls[0] as [{ input: { TableName: string; Item: { pk: string; sk: string } } }]
    expect(cmd.input.TableName).toBe('tbl')
    expect(cmd.input.Item.pk).toBe('APP#a#DAY#2026-01-01')
    expect(cmd.input.Item.sk).toBe('1#id1')
    expect('ttl' in (cmd.input.Item as object)).toBe(false)
  })

  it('batches 26 rows in two calls', async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({
      appId: 'a',
      event: {
        appId: 'a',
        sessionId: 's' + i,
        eventType: 'p',
        path: '/',
        clientTimestamp: 0,
      },
      serverTimestamp: 1,
      serverTimestampDayUtc: '2026-01-01',
      ingestId: 'id' + i,
      ipHash: '',
      ipMasked: '',
      geoLabel: '',
      userAgent: '',
    }))
    await putEventBatch('tbl', rows)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('dayUtcString & ulid', () => {
  it('UTC day', () => {
    expect(dayUtcString(Date.parse('2026-06-15T00:00:00.000Z'))).toBe('2026-06-15')
  })
  it('ingest id', () => {
    expect(newIngestId().length).toBeGreaterThan(8)
  })
})
