import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

const send = vi.fn()
vi.mock('./dynamoClient', () => ({
  documentClient: { send: (c: unknown) => send(c) },
}))

import { listDistinctAppIds, queryEventsByAppAndDay, queryEventsByAppAndTimeRange } from './v1Admin'

describe('queryEventsByAppAndDay', () => {
  beforeEach(() => {
    process.env.EVENTS_TABLE_NAME = 'events-t'
    send.mockReset()
  })

  it('throws when table missing', async () => {
    delete process.env.EVENTS_TABLE_NAME
    await expect(queryEventsByAppAndDay('a', '2026-01-01', 10, null)).rejects.toThrow('server_misconfiguration')
  })

  it('queries without cursor', async () => {
    send.mockResolvedValueOnce({ Items: [{ x: 1 }], LastEvaluatedKey: { pk: 'k' } })
    const r = await queryEventsByAppAndDay('app1', '2026-04-22', 50, null)
    expect(r.items).toEqual([{ x: 1 }])
    expect(r.nextCursor).toBeTruthy()
    const cmd = send.mock.calls[0][0] as QueryCommand
    expect(cmd.input.ExclusiveStartKey).toBeUndefined()
    expect(cmd.input.KeyConditionExpression).toBe('pk = :pk')
  })

  it('ignores bad cursor and queries without start key', async () => {
    send.mockResolvedValueOnce({ Items: [] })
    await queryEventsByAppAndDay('a', '2026-01-01', 10, 'not-valid-base64!!!')
    const cmd = send.mock.calls[0][0] as QueryCommand
    expect(cmd.input.ExclusiveStartKey).toBeUndefined()
  })

  it('uses base64url cursor for ExclusiveStartKey', async () => {
    const lek = { pk: 'APP#x#DAY#d', sk: 's' }
    const cursor = Buffer.from(JSON.stringify(lek), 'utf8').toString('base64url')
    send.mockResolvedValueOnce({ Items: [] })
    await queryEventsByAppAndDay('a', '2026-01-01', 5, cursor)
    const cmd = send.mock.calls[0][0] as QueryCommand
    expect(cmd.input.ExclusiveStartKey).toEqual(lek)
  })
})

describe('queryEventsByAppAndTimeRange', () => {
  beforeEach(() => {
    process.env.EVENTS_TABLE_NAME = 'events-t'
    send.mockReset()
  })

  it('queries single day partition with sk bounds', async () => {
    send.mockResolvedValueOnce({ Items: [{ serverTimestamp: 100, path: '/' }] })
    const from = Date.parse('2026-04-22T10:00:00.000Z')
    const to = Date.parse('2026-04-22T11:00:00.000Z')
    const r = await queryEventsByAppAndTimeRange('app1', from, to, 50)
    expect(r.items).toHaveLength(1)
    expect(r.nextCursor).toBeNull()
    const cmd = send.mock.calls[0][0] as QueryCommand
    expect(cmd.input.KeyConditionExpression).toContain('BETWEEN')
  })

  it('swaps inverted range', async () => {
    send.mockResolvedValueOnce({ Items: [] })
    await queryEventsByAppAndTimeRange('app1', 200, 100, 10)
    expect(send).toHaveBeenCalled()
  })
})

describe('listDistinctAppIds', () => {
  beforeEach(() => {
    process.env.EVENTS_TABLE_NAME = 'events-t'
    send.mockReset()
  })

  it('dedupes app ids from pk', async () => {
    send.mockResolvedValueOnce({
      Items: [{ pk: 'APP#x#DAY#2026-01-01' }, { pk: 'APP#y#DAY#2026-01-01' }, { pk: 'APP#x#DAY#2026-01-02' }],
      LastEvaluatedKey: undefined,
    })
    const ids = await listDistinctAppIds(100)
    expect(ids).toEqual(['x', 'y'])
    expect(send).toHaveBeenCalledWith(expect.any(ScanCommand))
  })
})
