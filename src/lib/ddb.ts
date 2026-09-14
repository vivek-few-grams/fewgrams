import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

/**
 * One DynamoDB document client for the whole app — see docs/LOCAL_DEV.md.
 *
 * A single conditional switches between DynamoDB Local and real AWS. Drop
 * DYNAMODB_ENDPOINT and the same code talks to ap-south-1 using the Amplify
 * service role's credentials from the instance metadata.
 *
 * Caution (docs/LOCAL_DEV.md): DynamoDB Local does not enforce IAM at all, so
 * the role isolation required by SPEC §8 cannot be verified here.
 */
const local = !!process.env.DYNAMODB_ENDPOINT;

export const TABLE = process.env.DYNAMODB_TABLE ?? "fewgrams";

/**
 * `DynamoDBDocument` rather than `DynamoDBDocumentClient` because
 * @auth/dynamodb-adapter requires the aggregated-client type. It extends
 * DynamoDBDocumentClient, so `.send(SomeCommand)` still works everywhere and
 * one client serves both the adapter and our own repositories.
 */
export const ddb = DynamoDBDocument.from(
  new DynamoDBClient({
    region: process.env.DYNAMODB_REGION ?? "ap-south-1",
    ...(local && {
      endpoint: process.env.DYNAMODB_ENDPOINT,
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    }),
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

/** The key and index attributes every item carries — SPEC §4. */
const KEY_ATTRS = ["PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK"] as const;

/**
 * Drop the key attributes from a stored item, leaving the domain record.
 *
 * Single-table design means keys are stored alongside the entity's own fields,
 * so every read has to strip them or they leak into the UI and into anything
 * that spreads the object back into a write.
 */
export function stripKeys<T>(item: Record<string, unknown>): T {
  const out = { ...item };
  for (const k of KEY_ATTRS) delete out[k];
  return out as T;
}
