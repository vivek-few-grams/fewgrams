# Local development — DynamoDB without AWS

Nothing in this project needs a provisioned AWS account until deployment. DynamoDB Local speaks
the real DynamoDB API on `localhost:8000`, so application code is identical to production.

## Prerequisites

DynamoDB Local v2.6+ requires **JRE 17 or newer**. This machine's system Java is Oracle 11, which
is left untouched:

```bash
brew install openjdk@17     # keg-only: no admin password, not registered as a system JVM
```

The run script points at `/opt/homebrew/opt/openjdk@17/bin/java` explicitly. Override with the
`JAVA17` env var if your path differs.

## Commands

```bash
npm run db:setup     # download DynamoDB Local into .dynamodb/bin (idempotent)
npm run db:local     # start on :8000, persisting to .dynamodb/data
npm run db:tables    # list tables (sanity check)
```

`.dynamodb/bin` and `.dynamodb/data` are gitignored — the jar is ~50 MB and must never be committed.

## Connecting from the app

One conditional, driven by a single env var. Drop `DYNAMODB_ENDPOINT` and the same code talks to
real AWS — nothing to refactor at deploy time.

```ts
const local = !!process.env.DYNAMODB_ENDPOINT;

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.DYNAMODB_REGION ?? "ap-south-1",
    ...(local && {
      endpoint: process.env.DYNAMODB_ENDPOINT,
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    }),
  }),
);
```

`.env.local`:

```
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_REGION=ap-south-1
DYNAMODB_TABLE=fewgrams
```

Credentials are required by the SDK but ignored by DynamoDB Local — any dummy values work.

**Do not name the region variable `AWS_REGION`.** That name is reserved and auto-populated in
Lambda-backed runtimes, so setting it in Amplify can be rejected.

## Gotchas that cost real time

- **Always run with `-sharedDb`** (the script does). Without it DynamoDB Local creates a *separate
  database per (access-key, region) pair*, so tables appear to vanish when either changes.
- **Download URLs are misleading.** AWS's CloudFront `v2.x` path serves the current **3.x** build;
  the `v3.x` path returns HTTP 403. Regional S3 buckets (e.g. `dynamodb-local-mumbai`) still serve
  the **deprecated 1.25.1** line. The setup script uses the working URL.

## What local DynamoDB cannot test

Build against it freely, but these need real AWS:

- **IAM permissions are not enforced at all** — so the role isolation in SPEC §8 cannot be verified
  locally. It must be tested on a deployed environment.
- Capacity and throttling behaviour (local never throttles)
- TTL sweep timing
- DynamoDB Streams triggering Lambda

## Table schema

Single table `fewgrams`, per SPEC §4: `PK`/`SK` plus `GSI1` (`GSI1PK`/`GSI1SK`) and `GSI2`
(`GSI2PK`/`GSI2SK`), both `ProjectionType=ALL`, billing mode `PAY_PER_REQUEST`.

Define this schema **once in TypeScript** and have both the local create-table script and the future
CDK stack read from it. Otherwise local and production drift, and you end up debugging a GSI that
only exists in one of them.
