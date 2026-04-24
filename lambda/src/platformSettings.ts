import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { documentClient } from './dynamoClient'

/** Single site config item (extend this table for more feature flags later). */
const CONFIG_ID = 'default'

function settingsTable(): string {
  const t = process.env.PLATFORM_SETTINGS_TABLE_NAME ?? ''
  if (!t) {
    throw new Error('server_misconfiguration')
  }
  return t
}

/** Infrastructure switch from Terraform / Lambda env. When false, self-serve registration is always closed. */
export function registrationEnvAllows(): boolean {
  return (process.env.AUTH_ALLOW_REGISTER ?? 'false') === 'true'
}

/** Admin-controlled preference in DynamoDB (may be true while still closed if env disallows). */
export async function getRegistrationPreference(): Promise<boolean> {
  const r = await documentClient.send(
    new GetCommand({ TableName: settingsTable(), Key: { id: CONFIG_ID } }),
  )
  if (!r.Item) {
    return false
  }
  return r.Item.allowRegister === true
}

export async function getRegistrationStatus(): Promise<{
  effective: boolean
  envAllowsRegister: boolean
  preference: boolean
}> {
  const preference = await getRegistrationPreference()
  const envAllowsRegister = registrationEnvAllows()
  return {
    preference,
    envAllowsRegister,
    effective: envAllowsRegister && preference,
  }
}

export async function isRegistrationOpen(): Promise<boolean> {
  const s = await getRegistrationStatus()
  return s.effective
}

export async function setRegistrationPreference(allowRegister: boolean, updatedByEmail: string): Promise<void> {
  const email = updatedByEmail.trim().slice(0, 256)
  await documentClient.send(
    new UpdateCommand({
      TableName: settingsTable(),
      Key: { id: CONFIG_ID },
      UpdateExpression: 'SET allowRegister = :a, updatedAt = :t, updatedByEmail = :e',
      ExpressionAttributeValues: {
        ':a': allowRegister,
        ':t': new Date().toISOString(),
        ':e': email || 'unknown',
      },
    }),
  )
}
