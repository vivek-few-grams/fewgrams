import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import { OpenIdConnectProvider, PolicyStatement, Role, WebIdentityPrincipal } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { ALERT_EMAIL, GITHUB_REPO } from "./config";

/**
 * The deploy role GitHub Actions assumes, and the two budget alarms —
 * SPEC §2.2.
 *
 * Deployed **once by hand** from a laptop (`npx cdk deploy FewgramsOps`), since
 * the role it creates is what lets CI deploy everything after it.
 */
export class OpsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    /* OIDC, so no AWS access key is ever stored in GitHub. One provider per
       account per URL — this stack assumes a fresh account. */
    const github = new OpenIdConnectProvider(this, "GitHubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    /* Only `main` of this one repository can assume it. A pull request, a fork
       or another branch gets nothing; CI checks on pull requests need no AWS
       access at all (`cdk synth` only). */
    const deployRole = new Role(this, "GitHubDeployRole", {
      roleName: "fewgrams-github-deploy",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(github.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_REPO}:ref:refs/heads/main`,
        },
      }),
    });

    /* The role can do one thing: hand off to the roles `cdk bootstrap` created.
       Those carry the actual deploy permissions, so this one stays minimal. */
    deployRole.addToPolicy(
      new PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );

    /* `cdk gc` after each deploy (deploy.yml) deletes the bundles no stack
       references any more. Unlike `cdk deploy` it does not hand off to a
       bootstrap role — it calls S3 and CloudFormation with this role's own
       credentials — so it needs these directly: read every template, and tag
       and delete in the two staging buckets (ap-south-1, and us-east-1 for the
       certificate and the edge function). Nothing else. */
    deployRole.addToPolicy(
      new PolicyStatement({
        actions: ["cloudformation:ListStacks", "cloudformation:DescribeStacks", "cloudformation:GetTemplate"],
        resources: ["*"],
      }),
    );
    deployRole.addToPolicy(
      new PolicyStatement({
        actions: ["s3:ListBucket", "s3:GetObjectTagging", "s3:PutObjectTagging", "s3:DeleteObject"],
        resources: [
          `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-*`,
          `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-*/*`,
        ],
      }),
    );

    new CfnOutput(this, "DeployRoleArn", {
      value: deployRole.roleArn,
      description: "Set as the AWS_DEPLOY_ROLE_ARN repository variable in GitHub",
    });

    /* Zero-spend alarm: the first cent charged, the same day — a NAT Gateway
       or a WAF shows up here before month-end. Then a ceiling at $10. AWS
       Budgets charges nothing for the first two budgets. */
    this.budget("ZeroSpend", 0.01, 100);
    this.budget("Monthly10", 10, 80);
  }

  private budget(id: string, limitUsd: number, alertAtPercent: number) {
    new CfnBudget(this, id, {
      budget: {
        budgetName: `fewgrams-${id.toLowerCase()}`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: limitUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: alertAtPercent,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: ALERT_EMAIL }],
        },
      ],
    });
  }
}
