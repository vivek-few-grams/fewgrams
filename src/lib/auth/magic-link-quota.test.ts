import { afterEach, describe, expect, it, vi } from "vitest";
import { TABLES } from "@/lib/ddb";
import { MagicLinkDayTotalEntity, MagicLinkQuotaEntity } from "@/lib/db/entities";
import {
  MAGIC_LINK_GAP_MS,
  MAGIC_LINKS_PER_DAY,
  MAGIC_LINKS_SITE_PER_DAY,
  magicLinkRefusal,
  takeMagicLink,
} from "@/lib/auth/magic-link-quota";

/** The owner's rule, 10 Oct 2026: two a day, a minute apart. Restated here so
 *  changing a constant is a deliberate edit to this test too. */
describe("the magic-link rule", () => {
  it("is two links a day, a minute apart", () => {
    expect(MAGIC_LINKS_PER_DAY).toBe(2);
    expect(MAGIC_LINK_GAP_MS).toBe(60_000);
  });

  /* The owner, 8 Nov 2026: the circuit breaker against a bot typing a new
     address each time — room for a launch day, so a customer never meets it. */
  it("stops sending to anyone after 1,000 links in a day", () => {
    expect(MAGIC_LINKS_SITE_PER_DAY).toBe(1000);
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

describe("site-wide total keys", () => {
  it("writes PK=MAGICLINKS SK=DAY#<IST day> to the users table, apart from every address", () => {
    const params = MagicLinkDayTotalEntity.update({ day: "2026-11-08" }).add({ sent: 1 }).params() as {
      TableName: string;
      Key: Record<string, string>;
      UpdateExpression: string;
    };
    expect(params.TableName).toBe(TABLES.users);
    expect(params.Key).toEqual({ PK: "MAGICLINKS", SK: "DAY#2026-11-08" });
    expect(params.UpdateExpression).not.toMatch(/GSI1/);
  });
});

/**
 * The order of the two counts, with the writes stubbed: a link is taken from
 * the address first and from the day's total only when the address may have
 * it, so a bot hammering one address never uses up the site's links.
 */
describe("takeMagicLink", () => {
  const conditionFailed = () =>
    Object.assign(new Error("condition"), { name: "ConditionalCheckFailedException" });

  /** A stand-in for ElectroDB's `update(...).add().set().where().go()`. */
  function stubUpdate(entity: { update: unknown }, outcome: "ok" | "refused") {
    const go = vi.fn(async () => {
      if (outcome === "refused") throw conditionFailed();
      return { data: {} };
    });
    const chain = { add: () => chain, set: () => chain, where: () => chain, go };
    vi.spyOn(entity as { update: () => unknown }, "update").mockReturnValue(chain);
    return go;
  }

  afterEach(() => vi.restoreAllMocks());

  const now = new Date("2026-11-08T10:00:00+05:30");

  it("sends when the address and the day both have room, counting both", async () => {
    const address = stubUpdate(MagicLinkQuotaEntity, "ok");
    const site = stubUpdate(MagicLinkDayTotalEntity, "ok");
    await expect(takeMagicLink("asha@example.com", now)).resolves.toBeNull();
    expect(address).toHaveBeenCalledOnce();
    expect(site).toHaveBeenCalledOnce();
  });

  it("refuses an address over its own limit without touching the day's total", async () => {
    stubUpdate(MagicLinkQuotaEntity, "refused");
    vi.spyOn(MagicLinkQuotaEntity, "get").mockReturnValue({
      go: async () => ({ data: { sent: 2, lastSentAt: now.getTime() - 3_600_000 } }),
    } as never);
    const site = stubUpdate(MagicLinkDayTotalEntity, "ok");
    await expect(takeMagicLink("asha@example.com", now)).resolves.toBe("EmailLimit");
    expect(site).not.toHaveBeenCalled();
  });

  it("pauses email links for everyone once the day's total is full", async () => {
    stubUpdate(MagicLinkQuotaEntity, "ok");
    stubUpdate(MagicLinkDayTotalEntity, "refused");
    await expect(takeMagicLink("new@example.com", now)).resolves.toBe("EmailPaused");
  });
});
