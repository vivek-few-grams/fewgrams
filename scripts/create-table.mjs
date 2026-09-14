/**
 * Creates the single `fewgrams` table — SPEC §4.
 *
 * Idempotent: re-running it against an existing table is a no-op. Safe to run
 * on every fresh checkout.
 *
 *   node scripts/create-table.mjs
 *
 * The same key schema is what the CDK stack must provision for ap-south-1, so
 * keep this file and the CDK definition in step.
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

const TABLE = process.env.DYNAMODB_TABLE ?? "fewgrams";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION ?? "ap-south-1",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

const attrs = ["PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK"];

try {
  await client.send(new DescribeTableCommand({ TableName: TABLE }));
  console.log(`✓ table "${TABLE}" already exists at ${ENDPOINT}`);
  process.exit(0);
} catch (err) {
  if (err.name !== "ResourceNotFoundException") throw err;
}

await client.send(
  new CreateTableCommand({
    TableName: TABLE,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: attrs.map((n) => ({
      AttributeName: n,
      AttributeType: "S",
    })),
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" },
      { AttributeName: "SK", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        // Catalogue lookups and the DELIVERY#<date> query (SPEC §4.1)
        IndexName: "GSI1",
        KeySchema: [
          { AttributeName: "GSI1PK", KeyType: "HASH" },
          { AttributeName: "GSI1SK", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        // Admin lists filtered by status (SPEC §4)
        IndexName: "GSI2",
        KeySchema: [
          { AttributeName: "GSI2PK", KeyType: "HASH" },
          { AttributeName: "GSI2SK", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  }),
);

console.log(`✓ created "${TABLE}" with GSI1 + GSI2 at ${ENDPOINT}`);
