import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/auth/roles";

/**
 * `session.user.role` exists for rendering decisions only — showing or hiding
 * a nav link. Authorisation goes through `requireRole()`, which reads the role
 * from DynamoDB. See src/lib/auth/guard.ts and SPEC §8.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role | string;
    } & DefaultSession["user"];
  }
}
