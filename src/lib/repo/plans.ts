import {
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { TABLE, ddb, stripKeys } from "@/lib/ddb";
import type { Plan, PlanWeek } from "@/lib/types";

/**
 * Plan definitions and their rotation weeks — SPEC §4:
 *   PK = PLAN#<planId>  SK = META           (the plan)
 *   PK = PLAN#<planId>  SK = WEEK#<1..4>    (one rotation week each)
 *
 * Rotation weeks share the plan's partition, so one Query with
 * `begins_with(SK, "WEEK#")` returns the whole rotation.
 *
 * DEVIATION FROM SPEC §4, deliberate: the spec's table gives the plan
 * definition no GSI1 entry, but the home page has to list every plan. Without
 * an index that is a full-table Scan. Plans therefore also write
 * `GSI1PK = "PLAN"` / `GSI1SK = <sortOrder>#<slug>`, which makes listing a
 * Query and gives the admin control over card order for free.
 */

const planKey = (id: string) => ({ PK: `PLAN#${id}`, SK: "META" });

const toRow = (p: Plan) => ({
  ...p,
  ...planKey(p.id),
  GSI1PK: "PLAN",
  GSI1SK: `${String(p.sortOrder).padStart(3, "0")}#${p.slug}`,
});

const strip = <T,>(r: Record<string, unknown>): T => stripKeys<T>(r);

export async function listPlans(
  opts: { activeOnly?: boolean } = {},
): Promise<Plan[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "PLAN" },
    }),
  );
  const all = (res.Items ?? []).map((i) => strip<Plan>(i));
  return opts.activeOnly ? all.filter((p) => p.active) : all;
}

export async function getPlanWeeks(planId: string): Promise<PlanWeek[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `PLAN#${planId}`, ":sk": "WEEK#" },
    }),
  );
  return (res.Items ?? [])
    .map((i) => strip<PlanWeek>(i))
    .sort((a, b) => a.week - b.week);
}

/** Every plan with its rotation attached. One Query for the plans, then one
 *  per plan for its weeks — fine at three or four plans, and the home page is
 *  statically rendered anyway. */
export async function listPlansWithWeeks(opts: { activeOnly?: boolean } = {}) {
  const plans = await listPlans(opts);
  return Promise.all(
    plans.map(async (plan) => ({ plan, weeks: await getPlanWeeks(plan.id) })),
  );
}

export async function putPlan(plan: Plan, weeks: PlanWeek[]): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: toRow(plan) }));

  if (weeks.length === 0) return;
  await ddb.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE]: weeks.map((w) => ({
          PutRequest: {
            Item: {
              PK: `PLAN#${plan.id}`,
              SK: `WEEK#${w.week}`,
              planId: plan.id,
              week: w.week,
              varietySlugs: w.varietySlugs,
            },
          },
        })),
      },
    }),
  );
}

export async function deletePlan(id: string): Promise<void> {
  const weeks = await getPlanWeeks(id);
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: planKey(id) }));
  if (weeks.length === 0) return;
  await ddb.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE]: weeks.map((w) => ({
          DeleteRequest: { Key: { PK: `PLAN#${id}`, SK: `WEEK#${w.week}` } },
        })),
      },
    }),
  );
}
