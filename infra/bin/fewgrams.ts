import { App } from "aws-cdk-lib";
import { CertStack } from "../lib/cert-stack";
import { DOMAIN_NAME, REGION } from "../lib/config";
import { DataStack } from "../lib/data-stack";
import { OpsStack } from "../lib/ops-stack";
import { WebStack } from "../lib/web-stack";

/**
 * One CDK app, four stacks — SPEC §2.2.
 *
 *   FewgramsOps   GitHub deploy role, budget alarms   (deployed once, by hand)
 *   FewgramsData  the three DynamoDB tables
 *   FewgramsCert  the HTTPS certificate, us-east-1    (only with DOMAIN_NAME)
 *   FewgramsWeb   the site: CloudFront + Lambda + S3
 *
 * The account comes from whatever credentials run `cdk` — the OIDC role in CI,
 * a profile on a laptop.
 */
const app = new App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
if (!account)
  throw new Error("No AWS account: run with credentials, or set CDK_DEFAULT_ACCOUNT for a synth-only check");
const env = { account, region: REGION };

/**
 * The site stays behind a password until it is deliberately opened. Either
 * SITE_GATE (`user:password`) or SITE_PUBLIC=true must be set, so a deploy that
 * forgets both fails instead of silently publishing the site.
 */
const siteGate = process.env.SITE_GATE || null;
if (!siteGate && process.env.SITE_PUBLIC !== "true") {
  throw new Error("Set SITE_GATE=user:password to deploy the site privately, or SITE_PUBLIC=true to open it");
}

new OpsStack(app, "FewgramsOps", { env });

const data = new DataStack(app, "FewgramsData", { env });

const cert = DOMAIN_NAME
  ? new CertStack(app, "FewgramsCert", {
      env: { account, region: "us-east-1" },
      crossRegionReferences: true,
      domainName: DOMAIN_NAME,
    })
  : undefined;

new WebStack(app, "FewgramsWeb", {
  env,
  crossRegionReferences: !!cert,
  /* cdk.json sits at the repository root, so cdk always runs from there. */
  appDirectory: process.cwd(),
  tables: [data.users, data.catalogue, data.orders],
  siteGate,
  domain: cert && DOMAIN_NAME ? { name: DOMAIN_NAME, certificate: cert.certificate } : undefined,
});
