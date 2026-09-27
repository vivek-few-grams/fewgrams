import { GetCommand, ScanCommand, type ScanCommandOutput } from "@aws-sdk/lib-dynamodb";
import { TABLES, ddb } from "@/lib/ddb";
import { isRole, type Role } from "@/lib/auth/roles";
import { getProfile } from "./profile";

/**
 * Everyone who has signed in — for `/admin/customers` (27 Sep 2026).
 *
 * Two kinds of row in the users table make a customer: the Auth.js adapter's
 * user item (`USER#<id> / USER#<id>`, carrying `email`, `name` and our `role`)
 * and our own `USER#<id> / PROFILE` (the name and phone they typed). Neither
 * has an index that lists every user, so this is **one Scan** of the users
 * table, filtered to those two row shapes. Fine at a one-farm shop's size —
 * hundreds of people — and it is only ever run from an admin screen. Add a
 * GSI when that stops being true, not before.
 */

export type CustomerRow = {
  userId: string;
  email: string | null;
  /** What they typed on their profile, else what the identity provider gave. */
  name: string | null;
  phone: string | null;
  role: Role;
};

export async function listCustomers(): Promise<CustomerRow[]> {
  const users = new Map<string, { email: string | null; name: string | null; role: Role }>();
  const profiles = new Map<string, { name: string | null; phone: string | null }>();

  let start: ScanCommandOutput["LastEvaluatedKey"];
  do {
    const page: ScanCommandOutput = await ddb.send(
      new ScanCommand({
        TableName: TABLES.users,
        FilterExpression: "(#type = :user AND PK = SK) OR SK = :profile",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":user": "USER", ":profile": "PROFILE" },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) {
      const pk = String(item.PK ?? "");
      if (!pk.startsWith("USER#")) continue;
      const userId = pk.slice("USER#".length);
      if (item.SK === "PROFILE") {
        profiles.set(userId, { name: item.name ?? null, phone: item.phone ?? null });
      } else {
        users.set(userId, {
          email: item.email ?? null,
          name: item.name ?? null,
          role: isRole(item.role) ? item.role : "customer",
        });
      }
    }
    start = page.LastEvaluatedKey;
  } while (start);

  return [...users].map(([userId, u]) => {
    const p = profiles.get(userId);
    return {
      userId,
      email: u.email,
      name: p?.name || u.name,
      phone: p?.phone ?? null,
      role: u.role,
    };
  });
}

/** One customer's user row and profile — two GetItems, no scan — or null
 *  for an id nobody has. */
export async function getCustomer(userId: string): Promise<CustomerRow | null> {
  const [user, profile] = await Promise.all([
    ddb.send(
      new GetCommand({
        TableName: TABLES.users,
        Key: { PK: `USER#${userId}`, SK: `USER#${userId}` },
      }),
    ),
    getProfile(userId),
  ]);
  const u = user.Item;
  if (!u) return null;
  return {
    userId,
    email: u.email ?? null,
    name: profile?.name || u.name || null,
    phone: profile?.phone ?? null,
    role: isRole(u.role) ? u.role : "customer",
  };
}
