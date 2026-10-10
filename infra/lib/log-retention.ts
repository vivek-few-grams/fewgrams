import { CfnResource, RemovalPolicy, type IAspect } from "aws-cdk-lib";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import type { IConstruct } from "constructs";
import { LOG_RETENTION } from "./config";

/**
 * Gives every Lambda function in a stack a log group with CERT-In's 180-day
 * retention — SPEC §2.2.
 *
 * Lambda creates `/aws/lambda/<name>` on first invocation with retention set to
 * "never expire", and neither cdk-nextjs nor CDK's own custom-resource handlers
 * create one. Pre-creating the group under that exact name is the only way to
 * set retention on a function this app does not construct itself — which is
 * all of them. An aspect reaches each one, including any a future cdk-nextjs
 * release adds.
 *
 * Matches on the CloudFormation type rather than `CfnFunction`, because CDK's
 * own singleton handlers are raw `CfnResource`s of that type.
 *
 * Only works for a log group that does not exist yet: a function that has
 * already logged once owns its group, and CloudFormation refuses to create it
 * again. Apply it before the first deploy, as here.
 */
export class LogRetention implements IAspect {
  visit(node: IConstruct): void {
    if (!(node instanceof CfnResource) || node.cfnResourceType !== "AWS::Lambda::Function") return;
    if (node.node.scope?.node.tryFindChild("LogRetention")) return;

    new LogGroup(node.node.scope!, "LogRetention", {
      logGroupName: `/aws/lambda/${node.ref}`,
      retention: LOG_RETENTION,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
