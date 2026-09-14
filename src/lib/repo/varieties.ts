import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { TABLE, ddb, stripKeys } from "@/lib/ddb";
import type { Variety } from "@/lib/types";

/**
 * Variety records — SPEC §4:
 *   PK = VARIETY#<id>   SK = META   GSI1PK = VARIETY   GSI1SK = <slug>
 *
 * GSI1 is what makes "list every variety, ordered by slug" a Query rather
 * than a Scan.
 */

type Row = Variety & {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
};

const toRow = (v: Variety): Row => ({
  ...v,
  PK: `VARIETY#${v.id}`,
  SK: "META",
  GSI1PK: "VARIETY",
  GSI1SK: v.slug,
});

const strip = (r: Record<string, unknown>) => stripKeys<Variety>(r);

export async function listVarieties(
  opts: { activeOnly?: boolean } = {},
): Promise<Variety[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "VARIETY" },
    }),
  );
  const all = (res.Items ?? []).map(strip);
  return opts.activeOnly ? all.filter((v) => v.active) : all;
}

export async function getVarietyBySlug(slug: string): Promise<Variety | null> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
      ExpressionAttributeValues: { ":pk": "VARIETY", ":sk": slug },
      Limit: 1,
    }),
  );
  const item = res.Items?.[0];
  return item ? strip(item) : null;
}

export async function getVariety(id: string): Promise<Variety | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `VARIETY#${id}`, SK: "META" } }),
  );
  return res.Item ? strip(res.Item) : null;
}

export async function putVariety(v: Variety): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: toRow(v) }));
}

export async function deleteVariety(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: `VARIETY#${id}`, SK: "META" } }),
  );
}
