import { Duration } from "aws-cdk-lib";
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
  type IMetric,
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import { ALERT_EMAIL } from "./config";

/**
 * Emails the operator while something is happening, rather than at month-end
 * (8 Nov 2026). The budget alarms (ops-stack.ts) report money, and AWS's
 * billing data lags by up to a day; these report the site itself, within
 * minutes. There is no WAF in AWS (SPEC §2.2; the free firewall is Cloudflare's,
 * infra/README.md), so these are how a flood or a sign-in bot gets noticed.
 *
 * Five alarms, inside CloudWatch's ten free ones; SNS's first thousand emails a
 * month are free too. The topic's email has to be confirmed once — AWS sends
 * "AWS Notification - Subscription Confirmation" to ALERT_EMAIL on the first
 * deploy, and nothing arrives until its link is clicked.
 *
 * Not here, deliberately:
 * - **DynamoDB throttling.** A throttle alarm per table and per direction is
 *   six alarm metrics, past the free ten; a flood big enough to throttle a
 *   table shows up first as Lambda invocations and throttles.
 * - **CloudFront's own metrics.** They live in us-east-1, and this stack is in
 *   ap-south-1; the Lambda behind it sees the same traffic.
 */
export class Alerts extends Construct {
  constructor(scope: Construct, id: string, props: { functions: IFunction[] }) {
    super(scope, id);

    const topic = new Topic(this, "Topic", { topicName: "fewgrams-alerts", displayName: "Fewgrams alerts" });
    topic.addSubscription(new EmailSubscription(ALERT_EMAIL));
    const notify = new SnsAction(topic);

    const alarm = (name: string, metric: IMetric, threshold: number, description: string) => {
      const a = new Alarm(this, name, {
        alarmName: `fewgrams-${name.replace(/[A-Z]/g, (c, i) => (i ? "-" : "") + c.toLowerCase())}`,
        alarmDescription: description,
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        /* No data is the normal state: no traffic, no throttles, no mail. */
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      a.addAlarmAction(notify);
      /* And the all-clear, so an alert does not have to be chased to learn
         that it has passed. */
      a.addOkAction(notify);
    };

    const fiveMinutes = { period: Duration.minutes(5), statistic: "Sum" };
    for (const [i, fn] of props.functions.entries()) {
      const suffix = props.functions.length > 1 ? `${i + 1}` : "";
      alarm(
        `SiteThrottled${suffix}`,
        fn.metricThrottles(fiveMinutes),
        1,
        "The site turned visitors away: requests went past MAX_CONCURRENCY (infra/lib/config.ts). " +
          "A flood, or real traffic outgrowing the ceiling — look at Invocations before raising it.",
      );
      alarm(
        `TrafficSurge${suffix}`,
        fn.metricInvocations(fiveMinutes),
        3000,
        "Over 3,000 requests reached the app in five minutes (10 a second, held). " +
          "Far above launch traffic: a bot or a flood is likely. With Cloudflare in front, its Security → Events shows who.",
      );
      alarm(
        `AppErrors${suffix}`,
        fn.metricErrors(fiveMinutes),
        5,
        "The app's Lambda failed 5 or more times in five minutes. Check its CloudWatch logs.",
      );
    }

    /* SES's own reputation figures. SES reviews an account at a 5% bounce rate
       or 0.1% complaints and pauses it at 10% / 0.5% — which would stop order
       receipts and sign-in links. The magic-link caps (src/lib/auth/
       magic-link-quota.ts) are the defence; these say when it is being
       tested. */
    const ses = (metricName: string) =>
      new Metric({ namespace: "AWS/SES", metricName, period: Duration.hours(1), statistic: "Maximum" });
    alarm(
      "EmailBounces",
      ses("Reputation.BounceRate"),
      0.05,
      "SES bounce rate reached 5% — the level at which AWS reviews the account. " +
        "A bot typing addresses into the sign-in form is the usual cause.",
    );
    alarm(
      "EmailComplaints",
      ses("Reputation.ComplaintRate"),
      0.001,
      "SES complaint rate reached 0.1% — the level at which AWS reviews the account.",
    );
  }
}
