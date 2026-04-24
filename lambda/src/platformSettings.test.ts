import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const send = vi.fn()

vi.mock('./dynamoClient', () => ({
  documentClient: {
    send: (cmd: unknown) => send(cmd),
  },
}))

import {
  getRegistrationPreference,
  getRegistrationStatus,
  isRegistrationOpen,
  registrationEnvAllows,
  setRegistrationPreference,
} from './platformSettings'

describe('platformSettings', () => {
  beforeEach(() => {
    process.env.PLATFORM_SETTINGS_TABLE_NAME = 'platform-t'
    send.mockReset()
  })

  it('registrationEnvAllows reads env', () => {
    process.env.AUTH_ALLOW_REGISTER = 'true'
    expect(registrationEnvAllows()).toBe(true)
    process.env.AUTH_ALLOW_REGISTER = 'false'
    expect(registrationEnvAllows()).toBe(false)
  })

  it('getRegistrationPreference false when missing item', async () => {
    send.mockResolvedValueOnce({})
    const v = await getRegistrationPreference()
    expect(v).toBe(false)
    expect(send).toHaveBeenCalledWith(expect.any(GetCommand))
  })

  it('getRegistrationPreference reads boolean', async () => {
    send.mockResolvedValueOnce({ Item: { id: 'default', allowRegister: true } })
    expect(await getRegistrationPreference()).toBe(true)
  })

  it('getRegistrationStatus combines env and preference', async () => {
    process.env.AUTH_ALLOW_REGISTER = 'true'
    send.mockResolvedValueOnce({ Item: { allowRegister: true } })
    const s = await getRegistrationStatus()
    expect(s).toEqual({
      preference: true,
      envAllowsRegister: true,
      effective: true,
    })
  })

  it('effective false when env off even if preference true', async () => {
    process.env.AUTH_ALLOW_REGISTER = 'false'
    send.mockResolvedValueOnce({ Item: { allowRegister: true } })
    const s = await getRegistrationStatus()
    expect(s.effective).toBe(false)
    expect(s.envAllowsRegister).toBe(false)
    expect(s.preference).toBe(true)
  })

  it('isRegistrationOpen uses effective', async () => {
    process.env.AUTH_ALLOW_REGISTER = 'true'
    send.mockResolvedValueOnce({ Item: { allowRegister: true } })
    expect(await isRegistrationOpen()).toBe(true)
  })

  it('setRegistrationPreference updates', async () => {
    send.mockResolvedValueOnce({})
    await setRegistrationPreference(false, 'admin@test.com')
    expect(send).toHaveBeenCalledWith(expect.any(UpdateCommand))
  })
})
