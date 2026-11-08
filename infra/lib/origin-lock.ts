import { CfnFunction, type Function as CloudFrontFunction } from "aws-cdk-lib/aws-cloudfront";

/** The header Cloudflare adds to every request it forwards. */
export const ORIGIN_LOCK_HEADER = "x-origin-verify";

/**
 * Only requests that came through Cloudflare reach the site (the owner, 8 Nov
 * 2026: Cloudflare's free firewall in front of CloudFront instead of AWS WAF —
 * infra/README.md, "Without a WAF").
 *
 * Cloudflare's protection is worthless if it can be walked round, and it can:
 * the distribution answers on its own `*.cloudfront.net` name, which is in
 * this stack's outputs and easy to find. So a Cloudflare Transform Rule adds
 * `x-origin-verify: <secret>` to every request it forwards, and this check
 * turns away anything without it with a 403 before the site gate, the scanner
 * block or the Lambda see it. The header is then removed, so the secret never
 * reaches the app or its logs.
 *
 * **Off until `CLOUDFLARE_ORIGIN_SECRET` is set** (a GitHub secret, read at
 * synth like SITE_GATE). Deploying it before Cloudflare is proxying would
 * lock everyone out, so the order is: Transform Rule and orange cloud first,
 * then the secret and a deploy. Undoing it is the reverse — clear the secret
 * and deploy *before* turning the orange cloud off.
 *
 * Static files (`/_next/static`, `/img`) are served from S3 without a function
 * and stay reachable on the CloudFront name, as they do past the site gate:
 * the same bytes for everyone, and cached.
 *
 * Same technique and tripwire as `gateSite`: prepended to cdk-nextjs's
 * viewer-request function, and synth fails if its shape changes.
 */
export function lockToCloudflare(viewerRequestFn: CloudFrontFunction, secret: string) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(secret)) {
    throw new Error(
      "CLOUDFLARE_ORIGIN_SECRET must be at least 32 letters, digits, '-' or '_' (openssl rand -hex 32)",
    );
  }
  const cfn = viewerRequestFn.node.defaultChild as CfnFunction;
  const code = cfn.functionCode;
  const entry = "function handler(event) {";
  if (typeof code !== "string" || !code.includes(entry)) {
    throw new Error(
      "cdk-nextjs's viewer-request function no longer has `function handler(event) {` — " +
        "the Cloudflare lock cannot be attached. Check infra/lib/origin-lock.ts against the new cdk-nextjs release.",
    );
  }

  /* cloudfront-js-1.0 is ES5.1: `var`, no arrow functions, no template literals. */
  const check = `
            var lockHeader = event.request.headers[${JSON.stringify(ORIGIN_LOCK_HEADER)}];
            if (!lockHeader || lockHeader.value !== ${JSON.stringify(secret)}) {
              return { statusCode: 403, statusDescription: "Forbidden" };
            }
            delete event.request.headers[${JSON.stringify(ORIGIN_LOCK_HEADER)}];`;
  cfn.functionCode = code.replace(entry, entry + check);
}
