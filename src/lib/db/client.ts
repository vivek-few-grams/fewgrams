import { TABLES, ddb } from "@/lib/ddb";

/**
 * Shared ElectroDB configuration — SPEC §4.
 *
 * One document client, three tables (SPEC §4.6). Each entity in
 * src/lib/db/entities.ts spreads the config for the table it belongs to, so
 * an entity cannot accidentally be written to the wrong one — the table name
 * is a property of the schema, not of the call site. The same client serves
 * Auth.js and its DynamoDB adapter.
 *
 * `ddb` is a `DynamoDBDocument`. ElectroDB sniffs the client by method
 * signature: it checks for the v2 surface first (which requires `createSet`,
 * a method v3 dropped) and falls through to the v3 `send`-only path. Verified
 * against node_modules/electrodb/src/client.js `identifyClientVersion`.
 * Passing the document client rather than the bare `DynamoDBClient` is
 * deliberate — it keeps our `removeUndefinedValues` marshall option in play.
 *
 * ## Why `ignoreOwnership: true`
 *
 * ElectroDB stamps two bookkeeping attributes, `__edb_e__` and `__edb_v__`,
 * onto every row it writes, and by default it *enforces* them on read: `get`
 * discards an item whose stamp does not match the entity, and `query` appends
 * a `FilterExpression` on them. Rows this application did not write through
 * ElectroDB are therefore invisible.
 *
 * That default is wrong for this table, for two reasons:
 *
 * 1. **Auth.js owns a third of the rows.** `USER#`, `ACCOUNT#`, `SESSION#`
 *    and `VT#` items are written by @auth/dynamodb-adapter, which knows
 *    nothing about ElectroDB and will never carry a stamp. Any future
 *    ElectroDB entity modelling users would silently read an empty table.
 * 2. **Rows written before ElectroDB arrived carry no stamp either** — and
 *    keeping them readable is the whole reason the entity schemas use
 *    explicit key templates (src/lib/db/entities.ts).
 *
 * Turning it off is safe *because* of those templates: entity identity is
 * carried by the key itself — `VARIETY#<id>`, `GSI1PK = "VARIETY"` — so no
 * query can reach another entity's rows and there is nothing for the filter
 * to protect against. It also saves DynamoDB evaluating a filter on every
 * read.
 *
 * Note this is not visible in `.params()`, which omits the identifier filter
 * even when it is enforced on `.go()`; src/lib/db/keys.test.ts asserts
 * against what `.go()` actually sends.
 */
const shared = { client: ddb, ignoreOwnership: true } as const;

/**
 * Profiles and delivery addresses, sharing each user's partition with the
 * Auth.js rows. Nothing here declares a GSI1 index on purpose: GSI1 on this
 * table belongs to the adapter's `EMAIL#<email>` lookup, and a profile row
 * that wrote GSI1PK would land in the middle of it.
 */
export const usersConfig = { ...shared, table: TABLES.users } as const;

/** Varieties, products, plans and their rotation weeks. */
export const catalogueConfig = { ...shared, table: TABLES.catalogue } as const;

/** Subscriptions, orders, payments, cycles and sow plans. Nothing models
 *  these yet; the config exists so the first entity that does cannot land in
 *  the catalogue table by default. */
export const ordersConfig = { ...shared, table: TABLES.orders } as const;

/**
 * Read options every list query must pass.
 *
 * Both flags exist for non-obvious reasons:
 *
 * - `ignoreOwnership` is repeated here even though the entity configs above already set it,
 *   because **the entity-level setting does not survive a query on a
 *   secondary index.** ElectroDB reassigns it — with `=`, not `||=` — while
 *   building the config for any indexed query, deriving it purely from the
 *   index's `projection`; an `ALL` projection lands on `false`. See
 *   node_modules/electrodb/src/entity.js, the "Auto-set ignoreOwnership"
 *   block. Per-call options are merged *after* that block, so passing it here
 *   is what actually takes effect. Without it, every GSI1 list query returns
 *   an empty array against rows this app did not write through ElectroDB —
 *   verified by observation, not inferred.
 *
 * - `pages: "all"` because a Query returns one 1 MB page by default. The
 *   catalogue is nowhere near that today, but a silent truncation at some
 *   future size would be a very quiet bug.
 */
export const LIST_OPTS = { pages: "all", ignoreOwnership: true } as const;

/** As above, for single-item reads, which do not paginate. */
export const READ_OPTS = { ignoreOwnership: true } as const;
