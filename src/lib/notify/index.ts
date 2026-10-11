import { brand } from "@/lib/brand";
import type { NotificationProvider } from "./provider";
import { sesProvider } from "./ses";

export type { EmailMessage, NotificationProvider } from "./provider";

/** Who every email is from: the brand's name and its sending address. */
export const EMAIL_FROM = `${brand.name} <${brand.email}>`;

/**
 * The transport for this environment. `EMAIL_TRANSPORT=ses` is set on the
 * production Lambda (infra `RUNTIME_CONSTANTS`); anywhere else there is none,
 * and callers print what they would have sent — local development needs no
 * email account at all.
 *
 * A production build with no transport is refused rather than falling back to
 * the console: a sign-in link written to a log is a sign-in link anyone with
 * log access can use.
 */
export function notificationProvider(): NotificationProvider | null {
  if (process.env.EMAIL_TRANSPORT === "ses") return sesProvider(EMAIL_FROM);
  if (process.env.NODE_ENV === "production") {
    throw new Error("No email transport: set EMAIL_TRANSPORT=ses (infra/lib/config.ts RUNTIME_CONSTANTS).");
  }
  return null;
}
