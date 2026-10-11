import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { EmailMessage, NotificationProvider } from "./provider";

/**
 * Amazon SES, through the Lambda's own role (web-stack.ts grants
 * `ses:SendEmail` on this region's identities) — no keys. The sender's domain
 * must be a verified SES identity (FewgramsOps, `MAIL_DOMAIN`).
 */
export function sesProvider(from: string): NotificationProvider {
  const client = new SESv2Client({ region: process.env.AWS_REGION ?? "ap-south-1" });
  return {
    name: "ses",
    async sendEmail({ to, subject, text, html }: EmailMessage) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
            },
          },
        }),
      );
    },
  };
}
