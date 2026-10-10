import { Aspects, CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import type { Function as CloudFrontFunction } from "aws-cdk-lib/aws-cloudfront";
import type { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import { NextjsGlobalFunctions } from "cdk-nextjs";
import type { Construct } from "constructs";
import { PARAMETER_PATH, RUNTIME_CONSTANTS, RUNTIME_PARAMETERS } from "./config";
import { LogRetention } from "./log-retention";
import { gateSite } from "./site-gate";
import { signPaymentWebhooks } from "./webhook-signing";

export interface WebStackProps extends StackProps {
  /** The Next.js app — the repository root. */
  readonly appDirectory: string;
  readonly tables: TableV2[];
  /** `user:password` while the site is private; `null` once it is public. */
  readonly siteGate: string | null;
  readonly domain?: { name: string; certificate: ICertificate };
}

/**
 * The site: Next.js on Lambda behind CloudFront, static files in S3 —
 * SPEC §2.2. `cdklabs/cdk-nextjs`'s `NextjsGlobalFunctions` runs `next build`
 * itself during synth, through Next.js's Deployment Adapter API.
 *
 * Never a `…Containers` construct: those bring a NAT Gateway and a load
 * balancer, about $120–140 a month before any traffic. No VPC either — every
 * service the app calls is reached over its public endpoint with IAM.
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const nextjs = new NextjsGlobalFunctions(this, "Nextjs", {
      buildDirectory: props.appDirectory,
      overrides: {
        nextjsFunctions: {
          functionProps: {
            /* Graviton: 20% cheaper per GB-second than x86 at the same price
               per request. cdk-nextjs stages sharp for this architecture
               whatever machine runs the build. */
            architecture: Architecture.ARM_64,
            environment: runtimeEnvironment(),
          },
        },
        ...(props.domain && {
          nextjsGlobalFunctions: {
            nextjsDistributionProps: { certificate: props.domain.certificate },
          },
          nextjsDistribution: {
            distributionProps: { domainNames: [props.domain.name] },
          },
        }),
      },
    });

    /* The app talks to DynamoDB with this role — no keys in environment
       variables (src/lib/ddb.ts drops to the default credential chain when
       DYNAMODB_ENDPOINT is unset). */
    for (const { function: fn } of nextjs.nextjsFunctions.functionGroups) {
      for (const table of props.tables) table.grantReadWriteData(fn);
      /* Sign-in links and receipts, once NotificationProvider (SPEC §11) sends
         through SES. Scoped to this region's identities. */
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
        }),
      );
    }

    const viewerRequestFn = nextjs.nextjsDistribution.node.findChild("CloudFrontFn") as CloudFrontFunction;
    if (props.siteGate) gateSite(viewerRequestFn, props.siteGate);
    signPaymentWebhooks(nextjs, viewerRequestFn);

    Aspects.of(this).add(new LogRetention());

    new CfnOutput(this, "SiteUrl", {
      value: props.domain ? `https://${props.domain.name}` : nextjs.url,
      description: "The public origin — AUTH_URL must equal it",
    });
    new CfnOutput(this, "CloudFrontDomain", {
      value: nextjs.nextjsDistribution.distribution.distributionDomainName,
      description: "Point the Cloudflare CNAME here (DNS-only)",
    });
  }
}

/**
 * The Lambda's environment: the plain constants, plus each listed parameter as
 * a CloudFormation dynamic reference. CloudFormation reads the value from
 * Parameter Store at deploy time, so it never appears in the synthesized
 * template, the CDK asset bucket or this repository.
 *
 * Standard String parameters, not SecureString: CloudFormation cannot resolve a
 * SecureString into a Lambda environment variable. Lambda encrypts its
 * environment at rest either way, and IAM decides who can read either.
 */
function runtimeEnvironment(): Record<string, string> {
  const env: Record<string, string> = { ...RUNTIME_CONSTANTS };
  for (const name of RUNTIME_PARAMETERS) {
    env[name] = `{{resolve:ssm:${PARAMETER_PATH}/${name}}}`;
  }
  /* CloudFormation resolves a dynamic reference only when the resource
     changes, so editing a parameter alone is invisible to it: the deploy says
     "no changes" and the Lambda keeps the old value. The deploy workflow sets
     this to its run id, which makes every deploy re-read every parameter. */
  if (process.env.DEPLOY_REVISION) env.DEPLOY_REVISION = process.env.DEPLOY_REVISION;
  return env;
}
