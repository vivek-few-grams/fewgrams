import { Stack, type StackProps } from "aws-cdk-lib";
import { Certificate, CertificateValidation, type ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import type { Construct } from "constructs";

/**
 * The HTTPS certificate for the custom domain — SPEC §2.2.
 *
 * The one stack outside ap-south-1: CloudFront only reads certificates from
 * us-east-1. It holds a certificate and nothing else — no data, no logs.
 *
 * DNS is on Cloudflare, not Route 53, so validation cannot be automatic. The
 * first deploy waits on this stack until the CNAME shown in the CloudFormation
 * events (and in ACM's console) is added in Cloudflare as **DNS-only**. ACM
 * renews it on its own after that, as long as the CNAME stays.
 */
export class CertStack extends Stack {
  readonly certificate: ICertificate;

  constructor(scope: Construct, id: string, props: StackProps & { domainName: string }) {
    super(scope, id, props);

    this.certificate = new Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: CertificateValidation.fromDns(),
    });
  }
}
