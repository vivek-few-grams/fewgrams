import { Duration, Stack } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  experimental,
  FunctionEventType,
  LambdaEdgeEventType,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
  type Function as CloudFrontFunction,
} from "aws-cdk-lib/aws-cloudfront";
import { FunctionUrlOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import type { NextjsGlobalFunctions } from "cdk-nextjs";

/**
 * Lets the payment webhooks reach the app through CloudFront.
 *
 * CloudFront signs every request to the Lambda Function URL (Origin Access
 * Control), but it does not hash the body, so a POST with a body must already
 * carry `x-amz-content-sha256` or Lambda answers `403 InvalidSignatureException`
 * (cdk-nextjs README, "Limitations"). The site's own pages get the header from a
 * fetch wrapper cdk-nextjs injects. Razorpay and Cashfree do not send it, so
 * without this every webhook would be refused — and the webhook is what pays an
 * order whose customer closed the tab before the redirect (SPEC §9.2).
 *
 * A Lambda@Edge function on origin-request reads the body and adds the hash
 * before CloudFront signs the request. It sits on one extra behavior,
 * `/api/payments/*`, so it runs only for payment traffic — a few requests a
 * day — and never on page views. Lambda@Edge has no free tier, but at that
 * volume it is fractions of a cent.
 *
 * Lambda@Edge must live in us-east-1; `experimental.EdgeFunction` creates that
 * stack itself.
 *
 * **Verify on the first deploy** by sending a test webhook from the Razorpay
 * dashboard and checking it returns 200, not 403.
 */
export function signPaymentWebhooks(nextjs: NextjsGlobalFunctions, viewerRequestFn: CloudFrontFunction) {
  const stack = Stack.of(nextjs);
  const functionUrl = nextjs.nextjsFunctions.functionUrl;
  if (!functionUrl) throw new Error("NextjsGlobalFunctions has no Function URL to route payments to");

  const hashBody = new experimental.EdgeFunction(stack, "PaymentBodyHash", {
    runtime: Runtime.NODEJS_22_X,
    handler: "index.handler",
    memorySize: 128,
    timeout: Duration.seconds(5),
    code: Code.fromInline(`
      const { createHash } = require("node:crypto");
      exports.handler = async (event) => {
        const request = event.Records[0].cf.request;
        const body = request.body;
        if (!body || !body.data || body.inputTruncated) return request;
        const bytes = Buffer.from(body.data, body.encoding === "base64" ? "base64" : "utf8");
        request.headers["x-amz-content-sha256"] = [
          { key: "x-amz-content-sha256", value: createHash("sha256").update(bytes).digest("hex") },
        ];
        return request;
      };
    `),
  });

  nextjs.nextjsDistribution.distribution.addBehavior(
    "/api/payments/*",
    FunctionUrlOrigin.withOriginAccessControl(functionUrl),
    {
      allowedMethods: AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      /* Same as cdk-nextjs's dynamic behavior: a Function URL needs its own
         Host header, so everything else the viewer sent is forwarded but that. */
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      /* cdk-nextjs's viewer-request function, which sets x-forwarded-host to
         the public host. The payment return route redirects the customer, so
         it has to know the real domain rather than the Function URL's. */
      functionAssociations: [{ function: viewerRequestFn, eventType: FunctionEventType.VIEWER_REQUEST }],
      edgeLambdas: [
        {
          functionVersion: hashBody.currentVersion,
          eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
          includeBody: true,
        },
      ],
    },
  );
}
