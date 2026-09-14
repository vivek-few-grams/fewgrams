import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DynamoDBAdapter } from "@auth/dynamodb-adapter";
import { TABLE, ddb } from "@/lib/ddb";
import { brand } from "@/lib/brand";
import { DEFAULT_ROLE, isBootstrapAdmin } from "@/lib/auth/roles";
import { ensureUserRole, setUserRole } from "@/lib/auth/users";

/**
 * Auth.js configuration — SPEC §8.1.
 *
 * DECISION (14 Sep 2026): Google SSO + email magic link. No passwords.
 *
 * Why no passwords: the Credentials provider forces the JWT session strategy
 * app-wide — enforced in `@auth/core/lib/utils/assert.js`:
 *
 *     "Signing in with credentials only supported if JWT strategy is enabled"
 *
 * Database sessions are worth more here than password convenience, because
 * they make revoking an admin or staff member take effect on their very next
 * request. Adding passwords later is possible: it flips `session.strategy` to
 * "jwt" and logs everyone out once. It changes no authorisation code, because
 * `requireRole` reads the role from DynamoDB rather than from the session.
 *
 * Google's OAuth consent screen should be published straight to production.
 * For the `email`/`profile`/`openid` scopes there is an explicit carve-out:
 * no verification, no unverified-app warning, no user cap, no cost. Loopback
 * redirect URIs are exempt from Google's HTTPS rule, so localhost keeps
 * working against a production-published client.
 */

/** Google is optional so the whole flow can be built with no Google project. */
const googleConfigured = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DynamoDBAdapter(ddb, {
    // Mapped onto the existing single table (SPEC §4) rather than the
    // adapter's defaults of `pk`/`sk` in a `next-auth` table. Auth items then
    // share each user's partition with their profile and addresses.
    tableName: TABLE,
    partitionKey: "PK",
    sortKey: "SK",
    indexName: "GSI1",
    indexPartitionKey: "GSI1PK",
    indexSortKey: "GSI1SK",
  }),

  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,
  },

  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
    error: "/login",
  },

  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            /**
             * Safe specifically for Google, which verifies email ownership
             * itself. Without this, a user who first signs in by magic link
             * and later clicks "Continue with Google" on the same address is
             * refused with OAuthAccountNotLinked — which reads to them as a
             * broken site (`handle-login.js:250`).
             *
             * Do NOT copy this flag to a provider that does not verify email.
             */
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),

    /**
     * Magic link, defined inline rather than via the Nodemailer provider.
     * `nodemailer` is an optional peer dependency and `EmailConfig` only
     * requires `sendVerificationRequest`, so this needs no SMTP server and no
     * email service at all during development — the link goes to the terminal.
     *
     * TODO(launch): send through SPEC §11's NotificationProvider (Resend free
     * tier, or SES once the AWS account exists). Keep the dev branch below so
     * local development never needs credentials.
     */
    {
      id: "email",
      type: "email",
      name: "Email",
      from: `${brand.name} <${brand.email}>`,
      maxAge: 15 * 60, // link valid 15 minutes
      async sendVerificationRequest({ identifier, url }) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            [
              "",
              "┌─────────────────────────────────────────────────────────────",
              `│ Sign-in link for ${identifier}`,
              "│",
              `│ ${url}`,
              "│",
              "│ Valid 15 minutes. Paste it into the browser.",
              "└─────────────────────────────────────────────────────────────",
              "",
            ].join("\n"),
          );
          return;
        }
        throw new Error(
          "No email transport configured. Wire NotificationProvider (SPEC §11) before deploying.",
        );
      },
    },
  ],

  callbacks: {
    /**
     * Return a deliberately minimal session.
     *
     * The DynamoDB adapter hands back raw table items, so `user` and `session`
     * arrive carrying `PK`, `SK` and `sessionToken`. Those reach the browser
     * through /api/auth/session, which means the bearer token ends up in a
     * response body as well as its HttpOnly cookie — so anything that logs or
     * echoes a session would leak it. We rebuild the object from scratch
     * instead of deleting fields, so a future adapter change cannot quietly
     * reintroduce the leak.
     *
     * `role` here is for RENDERING ONLY — deciding whether to show an Admin
     * link. Never gate an action on it; use requireRole/assertRole, which
     * re-read DynamoDB (SPEC §8).
     */
    async session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
          role: (user as { role?: string }).role ?? DEFAULT_ROLE,
        },
      } as typeof session;
    },
  },

  events: {
    /**
     * Assign the initial role. Runs once, on account creation.
     *
     * ADMIN_EMAILS is the only path to the first admin — there is no seeded
     * account and no way to self-promote through the UI.
     */
    async createUser({ user }) {
      if (!user.id) return;
      await ensureUserRole(user.id, DEFAULT_ROLE);
      if (isBootstrapAdmin(user.email)) {
        await setUserRole(user.id, "admin");
      }
    },

    /**
     * Covers users created before roles existed, and re-applies bootstrap
     * admin if ADMIN_EMAILS changed. `ensureUserRole` will not overwrite an
     * existing role, so a deliberate demotion in the table survives sign-in.
     */
    async signIn({ user, isNewUser }) {
      if (!user.id || isNewUser) return;
      await ensureUserRole(user.id, DEFAULT_ROLE);
      if (isBootstrapAdmin(user.email)) {
        await setUserRole(user.id, "admin");
      }
    },
  },
});
