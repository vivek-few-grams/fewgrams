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
DYNAMODB_TABLE_PREFIX=fewgrams
```

`DYNAMODB_TABLE_PREFIX` names all three tables — `fewgrams-users`, `fewgrams-catalogue`,
`fewgrams-orders` — so they cannot drift apart. It replaced `DYNAMODB_TABLE` on 14 Sep 2026.

Credentials are required by the SDK but ignored by DynamoDB Local — any dummy values work.

**Do not name the region variable `AWS_REGION`.** That name is reserved and auto-populated in
Lambda-backed runtimes, so setting it in Amplify can be rejected.

## Gotchas that cost real time

- **Always run with `-sharedDb`** (the script does). Without it DynamoDB Local creates a *separate
  database per (access-key, region) pair*, so tables appear to vanish when either changes.
- **Download URLs are misleading.** AWS's CloudFront `v2.x` path serves the current **3.x** build;
  the `v3.x` path returns HTTP 403. Regional S3 buckets (e.g. `dynamodb-local-mumbai`) still serve
  the **deprecated 1.25.1** line. The setup script uses the working URL.

- **Vitest does not load `.env.local`.** `vitest.config.ts` sets up the `@/*` alias and nothing
  else, so a test or throwaway script that touches DynamoDB runs with `DYNAMODB_ENDPOINT` unset —
  which makes `src/lib/ddb.ts` point at **real ap-south-1** and fail with
  `UnrecognizedClientException` (a credentials error, which reads nothing like "wrong endpoint").
  Source the env first:

  ```bash
  set -a; . ./.env.local; set +a
  npx vitest run path/to/your.test.ts
  ```

  No test in the committed suite reads DynamoDB — `src/lib/db/keys.test.ts` asserts on `.params()`,
  not `.go()` — so this bites only on ad-hoc scripts run through vitest. Do not add a dotenv loader
  to the config to paper over it: a unit test that silently acquires a live database connection is
  worse than one that fails loudly.

## What local DynamoDB cannot test

Build against it freely, but these need real AWS:

- **IAM permissions are not enforced at all** — so the role isolation in SPEC §8 cannot be verified
  locally. It must be tested on a deployed environment.
- Capacity and throttling behaviour (local never throttles)
- TTL sweep timing
- DynamoDB Streams triggering Lambda

## Table schema

**Three tables**, per SPEC §4 and §4.6. All use `PK`/`SK`, `ProjectionType=ALL` on every index,
and `PAY_PER_REQUEST`:

| Table | Indexes | Holds |
|---|---|---|
| `fewgrams-users` | GSI1 | Auth.js user / account / session / VT, plus profile and addresses |
| `fewgrams-catalogue` | GSI1 | Varieties, products, plans + weeks, PINs, coupons, settings |
| `fewgrams-orders` | GSI1, GSI2 | Subscriptions, orders, payments, cycles, sow plans |

```bash
npm run db:create    # idempotent — creates any that are missing
npm run db:tables    # list what exists
```

Index counts differ on purpose: adding a GSI to a populated table triggers a backfill, so each
table gets only the indexes its access patterns need, and gets them now.

Define this schema **once in TypeScript** and have both `scripts/create-tables.mjs` and the future
CDK stack read from it. Otherwise local and production drift, and you end up debugging a GSI that
only exists in one of them.

---

## Auth (added 14 Sep 2026)

No AWS account and no Google project are needed to sign in locally.

```bash
npm run db:local      # DynamoDB Local (terminal 1)
npm run db:create     # create the three tables, idempotent
npm run dev           # terminal 2
```

Then open `/login`, enter any email, and **the sign-in link is printed in the terminal running
`npm run dev`** — no email is sent. Paste it into the browser.

Set `ADMIN_EMAILS` in `.env.local` before your first sign-in to become an admin; it is applied on
sign-in. To change a role afterwards, edit the table:

```bash
U=<user-id>
aws dynamodb update-item --table-name fewgrams-users \
  --endpoint-url http://localhost:8000 --region ap-south-1 \
  --key "{\"PK\":{\"S\":\"USER#$U\"},\"SK\":{\"S\":\"USER#$U\"}}" \
  --update-expression "SET #r = :r" \
  --expression-attribute-names '{"#r":"role"}' \
  --expression-attribute-values '{":r":{"S":"admin"}}'
```

The change takes effect on the **next request** — no re-login — because `requireRole` reads the role
from DynamoDB rather than from the session (SPEC §8.1).

### Traps

- **`src/proxy.ts`, not `/proxy.ts`.** Next.js 16 renamed `middleware.ts` to `proxy.ts`, and it must
  sit beside `app/`. Ours is under `src/`, so the file belongs at `src/proxy.ts`. Placed at the repo
  root it is silently ignored — no error, the matcher simply never runs.
- **Run `npx next typegen` after adding a route.** `PageProps<"/login">` fails to typecheck until
  the route types are regenerated.
- **DynamoDB Local does not enforce IAM**, so SPEC §8 role isolation cannot be verified against real
  IAM here. The application-level checks can be, and are (see below).
- Node 20 works, but the AWS SDK warns that releases after early January 2027 will require Node ≥22.

### Verifying the role gate locally

```bash
# 1. sign in as a non-admin, then:
curl -s -b jar.txt -o /dev/null -w "%{http_code} %{redirect_url}\n" localhost:3000/admin
#    → 307 http://localhost:3000/forbidden

# 2. promote in the table (command above), same cookie, no re-login:
#    → 200

# 3. demote again, same cookie:
#    → 307 http://localhost:3000/forbidden
```

---

## Browsing the data

```bash
npm run db:gui     # dynamodb-admin → http://localhost:8001
```

Three terminals in normal use: `npm run db:local`, `npm run dev`, `npm run db:gui`.

**The DynamoDB Local shell is gone.** `http://localhost:8000/shell` shipped with the 1.x line and
returns HTTP 400 on 3.x — AWS removed it. Don't go looking for it.

### Reading the tables

Key patterns, so the rows are legible (SPEC §4, §8.1):

| Table | PK | SK | Entity |
|---|---|---|---|
| `-users` | `USER#<id>` | `USER#<id>` | Auth.js user — carries `email` and `role` |
| `-users` | `USER#<id>` | `ACCOUNT#<provider>#<id>` | Linked OAuth identity |
| `-users` | `USER#<id>` | `SESSION#<token>` | Active session. **Delete the row to log that session out instantly** |
| `-users` | `USER#<id>` | `PROFILE` / `ADDR#<id>` | Ours (SPEC §4) |
| `-users` | `VT#<email>` | `VT#<hash>` | Unused magic-link token. Auth.js deletes it on use |
| `-catalogue` | `VARIETY#<id>` | `META` | Microgreen variety |
| `-catalogue` | `PRODUCT#<id>` | `META` | Rack / tray / seed / snack |
| `-catalogue` | `PLAN#<id>` | `META` / `WEEK#<1..4>` | Plan and its rotation weeks |
| `-orders` | `SUB#<id>` | `META` / `WEEK#<date>` | Subscription and its weeks |
| `-orders` | `ORDER#<id>` | `META` / `ITEM#<n>` | One-off order and its lines |

Useful filters: `PK begins_with VARIETY#`, or switch Scan → Query and select `GSI1` / `GSI2` to
exercise the indexes.

**Alternative:** NoSQL Workbench (`brew install --cask nosql-workbench`) is AWS's own free desktop
app. Heavier, but it does visual single-table modelling and can emit CDK — worth installing when the
CDK stack is written.

## ElectroDB (added 14 Sep 2026)

Keys are no longer hand-built. `src/lib/db/entities.ts` declares every entity and ElectroDB
generates the keys; `src/lib/repo/*.ts` holds only the access patterns. Rationale and cost working
in SPEC §4.5.

**Nothing about the stored data changed.** The entity schemas use explicit key `template`s and
`casing: "none"` precisely so that adopting ElectroDB needed no migration.
`src/lib/db/keys.test.ts` asserts the generated keys against the strings in SPEC §4 and fails if a
schema edit would orphan existing rows. Run it before believing any change to that file:

```bash
npx vitest run src/lib/db/keys.test.ts
```

### Traps

- **`.params()` is not what `.go()` sends.** ElectroDB's entity-ownership filtering happens when
  the *response* is formatted, not as a `FilterExpression`, so a params dump looks clean while
  `.go()` silently drops rows. Debug with a stub client (`.go({ client })`) or `.go({ data: "raw" })`,
  not with `.params()`.
- **`ignoreOwnership` on the entity config does not apply to secondary-index queries.** ElectroDB
  reassigns it while building the config for any indexed query, from the index's `projection`
  alone. Every read therefore passes `LIST_OPTS` / `READ_OPTS` from `src/lib/db/client.ts`. Symptom
  if you forget: a GSI1 list query returns `[]` against a table you can see holds the rows.
- **A Query returns one 1 MB page by default.** `LIST_OPTS` sets `pages: "all"`. Don't call `.go()`
  bare on a list.
- **Rows seeded by hand can be missing required attributes**, and ElectroDB will return them with
  those fields simply absent rather than erroring — it validates on write, not on read. One such
  row (`VARIETY#radish`, seeded without `id` and `slug`) was repaired on 14 Sep 2026. If a record
  renders with blank fields, scan the raw item before suspecting the code.
- Writes through ElectroDB add two bookkeeping attributes, `__edb_e__` and `__edb_v__`. Expect
  them in the GUI; nothing reads them (see SPEC §4.5).

### Leftovers you can clean up

`SUB#s001 / WEEK#2026-09-19` and `ORDER#o001 / META` in `fewgrams-orders` are hand-seeded fixtures
from an early session. Nothing reads them and no entity models them yet:

```bash
aws dynamodb delete-item --table-name fewgrams-orders --endpoint-url http://localhost:8000 \
  --region ap-south-1 --key '{"PK":{"S":"ORDER#o001"},"SK":{"S":"META"}}'
```

The **original single `fewgrams` table** is also still there. `scripts/migrate-split-tables.mjs`
copied rather than moved, so it is an intact rollback point. Drop it once you are satisfied:

```bash
aws dynamodb delete-table --table-name fewgrams \
  --endpoint-url http://localhost:8000 --region ap-south-1
```
