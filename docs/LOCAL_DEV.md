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

---

## Auth (added 14 Sep 2026)

No AWS account and no Google project are needed to sign in locally.

```bash
npm run db:local      # DynamoDB Local (terminal 1)
npm run db:table      # create the table, idempotent
npm run dev           # terminal 2
```

Then open `/login`, enter any email, and **the sign-in link is printed in the terminal running
`npm run dev`** — no email is sent. Paste it into the browser.

Set `ADMIN_EMAILS` in `.env.local` before your first sign-in to become an admin; it is applied on
sign-in. To change a role afterwards, edit the table:

```bash
U=<user-id>
aws dynamodb update-item --table-name fewgrams \
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

### Reading the single table

Key patterns, so the rows are legible (SPEC §4, §8.1):

| PK | SK | Entity |
|---|---|---|
| `USER#<id>` | `USER#<id>` | Auth.js user — carries `email` and `role` |
| `USER#<id>` | `ACCOUNT#<provider>#<id>` | Linked OAuth identity |
| `USER#<id>` | `SESSION#<token>` | Active session. **Delete the row to log that session out instantly** |
| `USER#<id>` | `PROFILE` / `ADDR#<id>` | Ours (SPEC §4) |
| `VT#<email>` | `VT#<hash>` | Unused magic-link token. Auth.js deletes it on use |
| `VARIETY#<id>` | `META` | Microgreen variety |
| `PRODUCT#<id>` | `META` | Rack / tray / seed / snack |
| `PLAN#<id>` | `META` / `WEEK#<1..4>` | Plan and its rotation weeks |

Useful filters: `PK begins_with VARIETY#`, or switch Scan → Query and select `GSI1` / `GSI2` to
exercise the indexes.

**Alternative:** NoSQL Workbench (`brew install --cask nosql-workbench`) is AWS's own free desktop
app. Heavier, but it does visual single-table modelling and can emit CDK — worth installing when the
CDK stack is written.
