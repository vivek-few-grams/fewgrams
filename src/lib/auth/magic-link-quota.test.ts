import { describe, expect, it } from "vitest";
import { TABLES } from "@/lib/ddb";
import { MagicLinkQuotaEntity } from "@/lib/db/entities";
import { MAGIC_LINK_GAP_MS, MAGIC_LINKS_PER_DAY, magicLinkRefusal } from "@/lib/auth/magic-link-quota";

/** The owner's rule, 10 Oct 2026: two a day, a minute apart. Restated here so
 *  changing a constant is a deliberate edit to this test too. */
describe("the magic-link rule", () => {
  it("is two links a day, a minute apart", () => {
    expect(MAGIC_LINKS_PER_DAY).toBe(2);
    expect(MAGIC_LINK_GAP_MS).toBe(60_000);
  });

  const now = Date.parse("2026-10-10T10:00:00+05:30");

  it("allows the first link of the day", () => {
    expect(magicLinkRefusal(null, now)).toBeNull();
  });

  it("makes the second link wait a full minute", () => {
    expect(magicLinkRefusal({ sent: 1, lastSentAt: now - 59_999 }, now)).toBe("EmailWait");
    expect(magicLinkRefusal({ sent: 1, lastSentAt: now - 60_000 }, now)).toBeNull();
  });

  it("refuses a third link however long the wait", () => {
    expect(magicLinkRefusal({ sent: 2, lastSentAt: now - 6 * 3_600_000 }, now)).toBe("EmailLimit");
  });

  it("reports the daily limit ahead of the wait", () => {
    expect(magicLinkRefusal({ sent: 2, lastSentAt: now - 1_000 }, now)).toBe("EmailLimit");
  });
});

describe("magic-link quota keys", () => {
  const key = { email: "asha@example.com", day: "2026-10-10" };

  it("writes PK=MAGICLINK#<email> SK=DAY#<IST day> to the users table", () => {
    const params = MagicLinkQuotaEntity.update(key).add({ sent: 1 }).params() as {
      TableName: string;
      Key: Record<string, string>;
    };
    expect(params.TableName).toBe(TABLES.users);
    expect(params.Key).toEqual({ PK: "MAGICLINK#asha@example.com", SK: "DAY#2026-10-10" });
  });

  it("stays out of the adapter's email index", () => {
    const params = MagicLinkQuotaEntity.update(key)
      .add({ sent: 1 })
      .set({ lastSentAt: 1, expires: 1 })
      .params() as { UpdateExpression: string };
    expect(params.UpdateExpression).not.toMatch(/GSI1/);
  });
});
