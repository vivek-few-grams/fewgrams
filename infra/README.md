# Infrastructure

One CDK app deploys everything: the site on Lambda behind CloudFront, the
three DynamoDB tables, the GitHub deploy role and the budget alarms. Why it is
built this way, and what it must never grow (a VPC, a NAT Gateway, a WAF), is
in SPEC §2.2.

| Stack | Region | Holds |
|---|---|---|
| `FewgramsOps` | ap-south-1 | GitHub OIDC deploy role, zero-spend and $10 budget alarms |
| `FewgramsData` | ap-south-1 | `fewgrams-users`, `fewgrams-catalogue`, `fewgrams-orders` |
| `FewgramsWeb` | ap-south-1 | CloudFront, the Next.js Lambda, S3 for static files and the cache |
| `edge-lambda-stack-…` | us-east-1 | The payment-webhook body hasher (Lambda@Edge must live there); created by `FewgramsWeb` |
| `FewgramsCert` | us-east-1 | The HTTPS certificate — only once `DOMAIN_NAME` is set |

Settings are in `lib/config.ts` and nowhere else.

## Day to day

Push to `main`. The **Deploy** workflow runs the tests, lint and type check,
then `cdk deploy --all` — about 6–10 minutes. **Actions → Deploy → Run
workflow** redeploys without a commit (after changing a parameter, say).

Pull requests run **CI**: the same checks plus `cdk synth`, which builds the
app exactly as a deploy would, without AWS access.

Rollback: `git revert` the commit and push.

## First-time setup

Once per AWS account, in this order.

1. **A separate AWS account for Fewgrams.** The always-free Lambda and
   CloudFront allowances are per account, so nothing else should share it.
   Turn on MFA for the root user and sign in day to day with an admin user,
   configured locally as a profile — `fewgrams` below.

2. **Raise the Lambda concurrency limit.** New accounts often start at 10
   requests at once. Service Quotas → AWS Lambda → *Concurrent executions* →
   request 1,000, in **ap-south-1**. Free; takes a day or so.

3. **Bootstrap CDK** in both regions it uses:

   ```sh
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile fewgrams)
   npx cdk bootstrap aws://$ACCOUNT/ap-south-1 aws://$ACCOUNT/us-east-1 --profile fewgrams
   ```

4. **Store the runtime parameters.** Every name in `RUNTIME_PARAMETERS`
   (`lib/config.ts`) must exist before the first deploy, as a **String**
   parameter (CloudFormation cannot put a SecureString into a Lambda's
   environment; IAM still decides who can read it):

   ```sh
   put() { aws ssm put-parameter --profile fewgrams --region ap-south-1 \
             --type String --overwrite --name "/fewgrams/prod/$1" --value "$2"; }
   put AUTH_SECRET "$(openssl rand -base64 32)"
   put AUTH_URL https://placeholder.invalid   # replaced in step 8
   put ADMIN_EMAILS you@example.com
   put AUTH_GOOGLE_ID …
   put AUTH_GOOGLE_SECRET …
   put RAZORPAY_KEY_ID …
   put RAZORPAY_KEY_SECRET …
   put RAZORPAY_WEBHOOK_SECRET …
   put DATA_GOV_IN_API_KEY …
   ```

   Type the real values in a terminal, not in a file in this repository. A
   courier's parameters are added the same way, then its line uncommented in
   `RUNTIME_PARAMETERS`.

5. **Deploy the ops stack by hand**, once — it creates the role CI deploys with:

   ```sh
   SITE_GATE=x:x npx cdk deploy FewgramsOps --profile fewgrams
   ```

   (`SITE_GATE` only has to be set for the app to synthesize; this stack does
   not use it.) Confirm the two emails AWS Budgets sends to `ALERT_EMAIL`.

6. **Configure GitHub** (Settings → Secrets and variables → Actions):
   - variable `AWS_DEPLOY_ROLE_ARN` = the `DeployRoleArn` output from step 5
   - secret `SITE_GATE` = `user:password` for the private phase

7. **Push to `main`** (or run the Deploy workflow). The first deploy creates the
   CloudFront distribution, which takes 5–15 minutes on its own.

8. **Point `AUTH_URL` at the site.** Copy the `SiteUrl` output of `FewgramsWeb`
   (`https://d….cloudfront.net`), `put AUTH_URL <it>`, and run the Deploy
   workflow again. Add `<SiteUrl>/api/auth/callback/google` to the Google OAuth
   client's redirect URIs.

9. **Check it works:**
   - the site asks for the `SITE_GATE` username and password
   - in the Razorpay dashboard, set the webhook to
     `<SiteUrl>/api/payments/razorpay/webhook` and send a test event: it must
     return **200**, not 403 (403 means the body-hash Lambda@Edge is not
     signing — see `lib/webhook-signing.ts`)
   - CloudWatch → Log groups: every `/aws/lambda/…` group shows 6 months'
     retention

## Before taking real orders

- **Sign-in email does not send yet.** `src/auth.ts` throws in production
  until NotificationProvider (SPEC §11) is wired to SES. Google sign-in works.
  The Lambda already has `ses:SendEmail` for this region's identities.
- **The tables are empty.** The admin screens fill them, as they did locally.
- **Opening the site:** set the repository variable `SITE_PUBLIC` to `true`,
  delete the `SITE_GATE` secret, and redeploy. With neither set, synth refuses
  to run — a forgotten secret cannot silently publish the site.

## Adding the domain

1. Set `DOMAIN_NAME` in `lib/config.ts` and push.
2. The deploy pauses on `FewgramsCert`. ACM's console (us-east-1) shows a
   validation CNAME: add it in Cloudflare as **DNS-only**. The deploy carries on
   once ACM sees it, usually within minutes.
3. In Cloudflare, CNAME the domain to the `CloudFrontDomain` output, DNS-only.
4. `put AUTH_URL https://<domain>`, redeploy, and update the Google redirect
   URI and the Razorpay/Cashfree webhook URLs.

## Costs to watch

At launch traffic the bill is cents (SPEC §2.2). What can change that:

- **A VPC or NAT Gateway** — ~$45/month. Nothing here needs one.
- **`…Containers` constructs** from cdk-nextjs — $120–140/month. Functions only.
- **CloudWatch log ingestion over 5 GB/month** — the first allowance a busy
  site exceeds. Log less in production rather than shortening retention, which
  CERT-In fixes at 180 days.
- **Old Lambda bundles** pile up in the CDK staging bucket, ~15 MB per deploy.
  `npx cdk gc --unstable=gc --profile fewgrams` now and then.

## Upgrading cdk-nextjs

It is experimental and pinned to an exact version. Read its release notes
before bumping it — especially for anything touching the viewer-request
CloudFront function, which `lib/site-gate.ts` edits (synth fails loudly if
that function's shape changes) — then check the CI synth and a deploy.
