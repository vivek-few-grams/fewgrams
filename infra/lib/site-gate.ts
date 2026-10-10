import { CfnFunction, type Function as CloudFrontFunction } from "aws-cdk-lib/aws-cloudfront";

/**
 * A username and password in front of the whole site while it is private —
 * SPEC §2.2. The browser shows its own sign-in box, so there is no page to
 * build and no text to translate.
 *
 * HTTP Basic Auth has to be checked at CloudFront: behind a Lambda Function URL
 * the viewer's `Authorization` header never reaches the app, because Origin
 * Access Control overwrites it to sign the request.
 *
 * CloudFront allows one function per event type per behavior, and cdk-nextjs
 * already uses viewer-request for its own (it pins `x-forwarded-host`, which
 * the runtime trusts). It refuses a second one through `overrides`, so the
 * check is **prepended to its function's code** instead. That reaches into the
 * construct's internals: if a cdk-nextjs upgrade renames the function or
 * changes its signature, `gateSite` throws at synth rather than deploying an
 * open site.
 *
 * Static files (`/_next/static`, `public/`) are served from S3 without a
 * function and stay reachable by URL. They are the same for every visitor and
 * hold nothing private; the pages, the data and the admin are gated.
 *
 * The payment webhooks are let through: Razorpay and Cashfree cannot answer a
 * password prompt, and each webhook is verified by signature and then settled
 * server to server (`settleOrder`), so it is not an opening.
 *
 * `credentials` is `user:password`. It ends up in the function's code, visible
 * to anyone with access to the AWS account — fine for a pre-launch gate, not a
 * place for a password used anywhere else.
 */
export function gateSite(viewerRequestFn: CloudFrontFunction, credentials: string) {
  if (!/^[^:]+:.+$/.test(credentials)) {
    throw new Error("SITE_GATE must be user:password");
  }
  const cfn = viewerRequestFn.node.defaultChild as CfnFunction;
  const code = cfn.functionCode;
  const entry = "function handler(event) {";
  if (typeof code !== "string" || code.split(entry).length !== 2) {
    throw new Error(
      "cdk-nextjs's viewer-request function no longer has exactly one `function handler(event) {` — " +
        "the site gate cannot be attached. Check infra/lib/site-gate.ts against the new cdk-nextjs release.",
    );
  }

  const expected = `Basic ${Buffer.from(credentials).toString("base64")}`;
  /* cloudfront-js-1.0 is ES5.1: `var`, no arrow functions, no template literals. */
  const check = `
            var gateHeader = event.request.headers.authorization;
            if (!/^\\/api\\/payments\\/[a-z]+\\/webhook$/.test(event.request.uri) &&
                (!gateHeader || gateHeader.value !== ${JSON.stringify(expected)})) {
              return {
                statusCode: 401,
                statusDescription: "Unauthorized",
                headers: { "www-authenticate": { value: "Basic realm=\\"Fewgrams\\"" } }
              };
            }`;
  cfn.functionCode = code.replace(entry, entry + check);
}
