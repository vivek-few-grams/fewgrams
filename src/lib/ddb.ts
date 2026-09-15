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

/**
 * Three tables, grouped by operational policy rather than by entity — SPEC
 * §4.6. Split from a single `fewgrams` table on 14 Sep 2026.
 *
 * The grouping is the point: these three want different backup, TTL, stream
 * and IAM settings, all of which DynamoDB configures per table.
 *
 * - `users`      — Auth.js user / account / session / verification-token
 *                  items, plus the profile and addresses that share each
 *                  user's partition. Wants a TTL on sessions; needs no
 *                  point-in-time recovery, since it is all re-creatable by
 *                  signing in again. Named for the partition, not for auth,
 *                  because delivery addresses live here too.
 * - `catalogue`  — varieties, products, plans and their rotation weeks, PIN
 *                  allowlist, coupons, settings. Admin-written, read-mostly,
 *                  cheap to re-enter.
 * - `orders`     — subscriptions, subscription weeks, one-off orders, order
 *                  items, payments, cycles, sow plans. Real money: PITR on,
 *                  and the only table that needs a stream. This is also the
 *                  only table where single-table design still earns its keep
 *                  — the `DELIVERY#<date>` index (SPEC §4.1) deliberately
 *                  returns subscription weeks and one-off orders together.
 *
 * One env var sets all three so nothing can drift between them.
 */
const prefix = process.env.DYNAMODB_TABLE_PREFIX ?? "fewgrams";

export const TABLES = {
  users: `${prefix}-users`,
  catalogue: `${prefix}-catalogue`,
  orders: `${prefix}-orders`,
} as const;

/**
 * `DynamoDBDocument` rather than `DynamoDBDocumentClient` because
 * @auth/dynamodb-adapter requires the aggregated-client type. It extends
 * DynamoDBDocumentClient, so `.send(SomeCommand)` still works everywhere and
 * one client serves the adapter and every ElectroDB entity
 * (src/lib/db/client.ts) alike.
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
