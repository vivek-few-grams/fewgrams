import { CfnFunction, type Function as CloudFrontFunction } from "aws-cdk-lib/aws-cloudfront";

/**
 * Answers the internet's background vulnerability scans with a 404 at
 * CloudFront, so they never wake the Lambda — the stand-in for a WAF (SPEC
 * §2.2: no WAF, $5 a month plus $1 a rule before any traffic).
 *
 * Every public site is probed all day for `/.env`, `/.git/config`,
 * `/wp-login.php`, `/phpmyadmin/` and the like. None of them exist here, and
 * the app would say so — but only after a cold start and a rendered 404 page,
 * billed per request. A CloudFront Function already runs on every page request
 * (cdk-nextjs's, plus the site gate), so one more regex there costs nothing.
 *
 * Only shapes this app can never serve are matched:
 * - a path segment starting with a dot, except `/.well-known/` (ACME, and the
 *   Apple Pay / Android app-link files if they ever arrive);
 * - a script extension — `.php`, `.asp(x)`, `.jsp`, `.cgi` — Next.js routes have
 *   no extension and `public/` files are served from S3 without a function;
 * - the well-known admin panels of other software.
 *
 * Runs before the site gate, so it keeps working once the site is public.
 * Same technique and same tripwire as `gateSite`: the check is prepended to
 * cdk-nextjs's viewer-request function, and synth fails if that function's
 * shape changes.
 */
export function blockScanners(viewerRequestFn: CloudFrontFunction) {
  const cfn = viewerRequestFn.node.defaultChild as CfnFunction;
  const code = cfn.functionCode;
  const entry = "function handler(event) {";
  if (typeof code !== "string" || !code.includes(entry)) {
    throw new Error(
      "cdk-nextjs's viewer-request function no longer has `function handler(event) {` — " +
        "the scanner block cannot be attached. Check infra/lib/scanner-block.ts against the new cdk-nextjs release.",
    );
  }

  /* cloudfront-js-1.0 is ES5.1: `var`, no arrow functions, no template literals. */
  const check = `
            if (/(^|\\/)\\.(?!well-known(\\/|$))|\\.(php\\d?|aspx?|jspx?|cgi)$|^\\/(wp-|wordpress|xmlrpc|phpmyadmin|pma\\/|cgi-bin|vendor\\/|actuator|server-status)/i
                .test(event.request.uri)) {
              return { statusCode: 404, statusDescription: "Not Found" };
            }`;
  cfn.functionCode = code.replace(entry, entry + check);
}
