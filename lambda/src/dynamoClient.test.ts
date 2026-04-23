import { describe, expect, it } from 'vitest'
import { documentClient } from './dynamoClient'

describe('dynamoClient', () => {
  it('exports a document client', () => {
    expect(documentClient).toBeDefined()
    expect(typeof documentClient.send).toBe('function')
  })
})
