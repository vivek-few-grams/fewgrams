import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLES, ddb } from "@/lib/ddb";
import { DEFAULT_ROLE, isRole, type Role } from "./roles";

/**
 * Role storage.
 *
 * The Auth.js DynamoDB adapter writes its user record at
 * `PK = USER#<id>`, `SK = USER#<id>`. We store `role` as an extra attribute on
 * that same item rather than in a separate row, so reading a role is a single
 * GetItem on the primary key.
 *
 * This coexists with SPEC §4's `USER#<id> / PROFILE` and
 * `USER#<id> / ADDR#<addrId>` items — same partition, different sort keys.
 */
const userKey = (id: string) => ({ PK: `USER#${id}`, SK: `USER#${id}` });

/**
 * Read a user's role straight from DynamoDB.
 *
 * Deliberately NOT read from the session or token. SPEC §8 requires the role
 * to be a genuine data restriction, and reading it per request is what makes
 * revocation immediate — and what means switching to JWT sessions later
 * (should email/password ever be added) changes no authorisation code.
 */
export async function getUserRole(userId: string): Promise<Role | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLES.users,
      Key: userKey(userId),
      ProjectionExpression: "#r",
      ExpressionAttributeNames: { "#r": "role" },
      ConsistentRead: true,
    }),
  );
  const role = res.Item?.role;
  return isRole(role) ? role : undefined;
}

export async function setUserRole(userId: string, role: Role): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: userKey(userId),
      UpdateExpression: "SET #r = :r",
      ExpressionAttributeNames: { "#r": "role" },
      ExpressionAttributeValues: { ":r": role },
    }),
  );
}

/**
 * Give a newly created user a role, without overwriting one already set.
 *
 * `attribute_not_exists(#r)` is what makes this safe to call on every sign-in:
 * a user promoted to admin in the table is never silently demoted back to
 * customer.
 */
export async function ensureUserRole(userId: string, role: Role = DEFAULT_ROLE) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.users,
        Key: userKey(userId),
        UpdateExpression: "SET #r = :r",
        ConditionExpression: "attribute_not_exists(#r)",
        ExpressionAttributeNames: { "#r": "role" },
        ExpressionAttributeValues: { ":r": role },
      }),
    );
  } catch (err) {
    if ((err as Error).name !== "ConditionalCheckFailedException") throw err;
    // Role already set — leave it alone. This is the expected path on every
    // sign-in after the first.
  }
}
