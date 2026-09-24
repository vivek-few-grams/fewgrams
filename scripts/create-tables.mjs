/**
 * Creates the three DynamoDB tables — SPEC §4.6.
 *
 * Idempotent: re-running against existing tables is a no-op, so this is safe
 * on every fresh checkout.
 *
 *   npm run db:create
 *
 * Indexes are deliberately not identical across the three. Adding a GSI to a
 * populated table triggers a backfill, so each table gets only the indexes
 * its access patterns actually need, and gets them now:
 *
 *   users      GSI1  — the adapter's email lookup, USER#<email>
 *   catalogue  GSI1  — list varieties / plans, and products by category
 *   orders     GSI1  — DELIVERY#<date>, the one query that must return
 *                      subscription weeks and one-off orders together (§4.1)
 *              GSI2  — STATUS#<status> for admin lists
 *              GSI3  — USER#<userId>, a customer's order history. Added
 *                      23 Sep 2026 with the first order entity; an existing
 *                      table gains it through UpdateTable below.
 *
 * The same key schema is what the CDK stack must provision for ap-south-1, so
 * keep this file and the CDK definition in step.
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";

const PREFIX = process.env.DYNAMODB_TABLE_PREFIX ?? "fewgrams";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION ?? "ap-south-1",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

const gsi = (n) => ({
  IndexName: `GSI${n}`,
  KeySchema: [
    { AttributeName: `GSI${n}PK`, KeyType: "HASH" },
    { AttributeName: `GSI${n}SK`, KeyType: "RANGE" },
  ],
  Projection: { ProjectionType: "ALL" },
});

/** `indexes` is the count of GSIs, which also determines which attributes
 *  have to be declared — DynamoDB rejects an AttributeDefinition that no key
 *  schema references. */
const tables = [
  { name: `${PREFIX}-users`, indexes: 1 },
  { name: `${PREFIX}-catalogue`, indexes: 1 },
  { name: `${PREFIX}-orders`, indexes: 3 },
];

for (const { name, indexes } of tables) {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: name }));
    const have = new Set((Table.GlobalSecondaryIndexes ?? []).map((i) => i.IndexName));
    /* DynamoDB adds one GSI per UpdateTable call, so a table missing several
       gains them over several runs; each run adds the lowest missing one. */
    const missing = Array.from({ length: indexes }, (_, i) => i + 1).find(
      (n) => !have.has(`GSI${n}`),
    );
    if (missing) {
      await client.send(
        new UpdateTableCommand({
          TableName: name,
          AttributeDefinitions: [
            { AttributeName: `GSI${missing}PK`, AttributeType: "S" },
            { AttributeName: `GSI${missing}SK`, AttributeType: "S" },
          ],
          GlobalSecondaryIndexUpdates: [{ Create: gsi(missing) }],
        }),
      );
      console.log(`+ added GSI${missing} to "${name}"`);
    } else {
      console.log(`= "${name}" already exists`);
    }
    continue;
  } catch (err) {
    if (err.name !== "ResourceNotFoundException") throw err;
  }

  const attrs = ["PK", "SK"];
  for (let n = 1; n <= indexes; n++) attrs.push(`GSI${n}PK`, `GSI${n}SK`);

  await client.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: attrs.map((n) => ({
        AttributeName: n,
        AttributeType: "S",
      })),
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: Array.from({ length: indexes }, (_, i) =>
        gsi(i + 1),
      ),
    }),
  );
  console.log(
    `+ created "${name}" with ${Array.from({ length: indexes }, (_, i) => `GSI${i + 1}`).join(" + ")}`,
  );
}

console.log(`✓ three tables ready at ${ENDPOINT}`);
