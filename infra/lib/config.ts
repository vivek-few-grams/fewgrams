import { RetentionDays } from "aws-cdk-lib/aws-logs";

/**
 * Everything the stacks need to know that is a decision rather than a
 * resource — SPEC §2.2. Edit here; the stacks read nothing else.
 */

/** ap-south-1, and not a latency preference: CERT-In's FAQ Q36 keeps records
 *  of financial transactions (the orders table) in Indian jurisdiction. */
export const REGION = "ap-south-1";

/** The GitHub repository allowed to deploy, `owner/name`. */
export const GITHUB_REPO = "vivek-few-grams/fewgrams";

/**
 * The public hostname, once there is one — e.g. `"fewgrams.in"`.
 *
 * `undefined` serves the site on its `*.cloudfront.net` address. Setting it
 * adds the certificate stack (us-east-1, because CloudFront only reads
 * certificates from there) and the alternate domain on the distribution; the
 * first deploy after that waits until the validation CNAME it prints is added
 * in Cloudflare. `AUTH_URL` has to change to match.
 */
export const DOMAIN_NAME: string | undefined = undefined;

/** Budget alarms go here. Not the care inbox (content/contact.json) — this is
 *  the operator. */
export const ALERT_EMAIL = "info.fewgrams@gmail.com";

/** One prefix names all three tables, exactly as `src/lib/ddb.ts` derives
 *  them, so nothing can drift between the app and the stack. */
export const TABLE_PREFIX = "fewgrams";

/** Where the runtime parameters live in SSM Parameter Store. */
export const PARAMETER_PATH = "/fewgrams/prod";

/**
 * Runtime settings resolved from Parameter Store at deploy time and set on the
 * Lambda. Each name must exist as a **String** parameter at
 * `${PARAMETER_PATH}/<NAME>` before a deploy, or CloudFormation stops and
 * names the missing one — see infra/README.md for the command.
 *
 * Only list what is actually configured. The couriers are left out until their
 * accounts are live; uncomment a line once its parameter exists.
 */
export const RUNTIME_PARAMETERS = [
  "AUTH_SECRET",
  "AUTH_URL",
  "ADMIN_EMAILS",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "DATA_GOV_IN_API_KEY",
  // "SELLER_GSTIN",
  // "DELHIVERY_ENV",
  // "DELHIVERY_API_TOKEN",
  // "SHIPROCKET_EMAIL",
  // "SHIPROCKET_PASSWORD",
  // "EKART_CLIENT_ID",
  // "EKART_USERNAME",
  // "EKART_PASSWORD",
  // "VELOCITY_API_KEY",
  // "VELOCITY_WAREHOUSES",
] as const;

/**
 * Settings the infrastructure owns, set as plain values. `COURIER_BOOKING` is
 * spelled out as off: booking a courier spends money (CLAUDE.md), and turning
 * it on should be a reviewed change to this file, not a parameter edit.
 */
export const RUNTIME_CONSTANTS = {
  DYNAMODB_TABLE_PREFIX: TABLE_PREFIX,
  DYNAMODB_REGION: REGION,
  COURIER_BOOKING: "off",
} as const;

/** 7 days — the owner's call, 10 Oct 2026, knowingly below the 180 days in
 *  CERT-In's Cyber Security Directions (28 Apr 2022), direction (iv). At
 *  launch volume 180 days costs well under $1 a month, so this is a decision
 *  about what to keep, not about money. Revisit before taking real orders. */
export const LOG_RETENTION = RetentionDays.ONE_WEEK;
