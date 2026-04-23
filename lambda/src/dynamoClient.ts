import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const c = new DynamoDBClient({})
export const documentClient = DynamoDBDocumentClient.from(c, { marshallOptions: { removeUndefinedValues: true } })
