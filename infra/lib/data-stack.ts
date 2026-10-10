import { RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2, type GlobalSecondaryIndexPropsV2 } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
import { TABLE_PREFIX } from "./config";

/**
 * The three DynamoDB tables — SPEC §4.6, `src/lib/ddb.ts`.
 *
 * The key schema mirrors `scripts/create-tables.mjs` exactly (string `PK`/`SK`,
 * `GSI<n>PK`/`GSI<n>SK`, projection ALL); keep the two in step. The explicit
 * table names are what the app derives from `DYNAMODB_TABLE_PREFIX`, so they are
 * fixed rather than generated — which also means this stack can never be
 * deployed twice into one account, and that is intended.
 *
 * Every table is retained if the stack is deleted and has deletion protection
 * on. Real orders cannot be re-created by redeploying.
 */
export class DataStack extends Stack {
  readonly users: TableV2;
  readonly catalogue: TableV2;
  readonly orders: TableV2;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.users = this.table("Users", "users", 1, {
      /* @auth/dynamodb-adapter writes `expires` (epoch seconds) on sessions and
         verification tokens and documents it as the TTL attribute. Expired
         rows then disappear for free instead of piling up. */
      timeToLiveAttribute: "expires",
    });

    /* Admin-written and cheap to re-enter (src/lib/ddb.ts), so no PITR. */
    this.catalogue = this.table("Catalogue", "catalogue", 1);

    /* Real money: point-in-time recovery on. GSI1 DELIVERY#<date>, GSI2
       STATUS#<status>, GSI3 USER#<userId> — see scripts/create-tables.mjs. */
    this.orders = this.table("Orders", "orders", 3, { pointInTimeRecovery: true });
  }

  private table(
    id: string,
    suffix: "users" | "catalogue" | "orders",
    indexes: number,
    extra: { timeToLiveAttribute?: string; pointInTimeRecovery?: boolean } = {},
  ): TableV2 {
    const globalSecondaryIndexes: GlobalSecondaryIndexPropsV2[] = Array.from({ length: indexes }, (_, i) => ({
      indexName: `GSI${i + 1}`,
      partitionKey: { name: `GSI${i + 1}PK`, type: AttributeType.STRING },
      sortKey: { name: `GSI${i + 1}SK`, type: AttributeType.STRING },
    }));

    return new TableV2(this, id, {
      tableName: `${TABLE_PREFIX}-${suffix}`,
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billing: Billing.onDemand(),
      globalSecondaryIndexes,
      timeToLiveAttribute: extra.timeToLiveAttribute,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: !!extra.pointInTimeRecovery },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
