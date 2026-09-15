/**
 * Roles — SPEC §8.
 *
 * Guest is the absence of a session, not a stored role, so it is not in this
 * list. Anyone signed in is at least a customer.
 */
export const ROLES = ["customer", "staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "customer";

/**
 * Rank, used by `hasRole`. Deliberately a total order rather than a permission
 * matrix, because SPEC §8's roles nest cleanly: an admin can do anything staff
 * can, and staff can do anything a customer can.
 *
 * If that ever stops being true — say staff must NOT see pricing even though
 * customers can — replace this with explicit capabilities. Do not bend the
 * ranking.
 */
const RANK: Record<Role, number> = { customer: 1, staff: 2, admin: 3 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasRole(actual: Role | undefined, required: Role): boolean {
  if (!actual) return false;
  return RANK[actual] >= RANK[required];
}

/**
 * Bootstrap admins, from ADMIN_EMAILS. This is how the very first admin comes
 * to exist — there is no seeded account and no way to self-promote through the
 * UI.
 *
 * Read at sign-in only. Removing an email here does NOT demote an existing
 * user; change their role in the table for that.
 */
export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
