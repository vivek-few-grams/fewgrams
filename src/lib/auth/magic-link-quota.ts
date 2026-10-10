import { MagicLinkQuotaEntity } from "@/lib/db/entities";
import { isConditionFailure, READ_OPTS } from "@/lib/db/client";
import { istDateISO } from "@/lib/delivery-date";

/**
 * How many sign-in links one address can be sent — SPEC §8.1.
 *
 * The owner's rule, 10 Oct 2026: **two a day, a minute apart; after that, sign
 * in with Google.** A day is the IST calendar day. Sessions last 30 days, so a
 * real customer rarely needs a second link, let alone a third.
 *
 * The point is less the SES bill (cents) than the sending reputation: a bot
 * typing addresses into the login form makes every one an email, many of them
 * bounce, and SES pauses an account whose bounce rate climbs — which would
 * stop order receipts too.
 *
 * Enforced in Auth.js's `signIn` callback (src/auth.ts), which runs before the
 * link is created, so a request posted straight to /api/auth meets the same
 * limit as the login form.
 */
export const MAGIC_LINKS_PER_DAY = 2;
export const MAGIC_LINK_GAP_MS = 60_000;

/** Also the `?error=` code the login page translates (`auth.login.errors`). */
export type MagicLinkRefusal = "EmailWait" | "EmailLimit";

export const MAGIC_LINK_REFUSALS: readonly MagicLinkRefusal[] = ["EmailWait", "EmailLimit"];

/** Pure: whether the day's row so far allows another link at `now`. */
export function magicLinkRefusal(
  row: { sent: number; lastSentAt: number } | null,
  now: number,
): MagicLinkRefusal | null {
  if (!row) return null;
  if (row.sent >= MAGIC_LINKS_PER_DAY) return "EmailLimit";
  if (now - row.lastSentAt < MAGIC_LINK_GAP_MS) return "EmailWait";
  return null;
}

/**
 * Takes one of today's links for `email`, or says why not.
 *
 * One conditional write does both the check and the count, so two requests in
 * the same instant — two Lambdas, or a double click — cannot both get the
 * second link. Only when the condition fails is the row read, to tell a
 * customer which of the two limits they met.
 *
 * A link is counted even if sending it then fails. That errs towards sending
 * too few, which is the safe side for this rule.
 */
export async function takeMagicLink(email: string, now: Date = new Date()): Promise<MagicLinkRefusal | null> {
  const day = istDateISO(now);
  const at = now.getTime();
  try {
    await MagicLinkQuotaEntity.update({ email, day })
      .add({ sent: 1 })
      /* TTL two days on: past the end of this IST day wherever in it we are. */
      .set({ lastSentAt: at, expires: Math.floor(at / 1000) + 2 * 86_400 })
      .where(
        ({ sent, lastSentAt }, { notExists, lt, lte }) =>
          `${notExists(sent)} OR (${lt(sent, MAGIC_LINKS_PER_DAY)} AND ${lte(lastSentAt, at - MAGIC_LINK_GAP_MS)})`,
      )
      .go();
    return null;
  } catch (err) {
    if (!isConditionFailure(err)) throw err;
    const { data } = await MagicLinkQuotaEntity.get({ email, day }).go(READ_OPTS);
    /* Null only if the row vanished between the two calls; a wait is the
       honest answer to a write that just lost a race. */
    return magicLinkRefusal(data, at) ?? "EmailWait";
  }
}
