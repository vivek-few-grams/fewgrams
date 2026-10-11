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
   CloudFront allowances are shared by everything billed together, so nothing
   else should run in this organization. Turn on MFA for the root user and
   sign in day to day with an admin user. Locally that user is an
   [aws-vault](https://github.com/ByteNess/aws-vault) profile — `fg` below —
   with MFA required, so the key lives in the Keychain and reaches only the
   one command it wraps. Run every command through it: on a machine with
   other AWS work, the `default` profile is someone else's account.

   An account opened through AWS's newer simplified sign-up is pinned to one
   region (Sydney for an Indian address) with no Lambda@Edge. Fixing that is
   two steps: **Activate advanced features** (AWS Settings → Projects; free,
   irreversible), then edit the `AdvancedModeRegionRestrictionSecurityControlPolicy`
   SCP in AWS Organizations — delete the `UsEast1Partitional` statement and
   put `ap-south-1` in `RegionFloor` in place of the original region. Deploy
   into the project's member account, never the management account.

2. **Check the Lambda concurrency limit** in **ap-south-1** (Service Quotas →
   AWS Lambda → *Concurrent executions*). Some new accounts start at 10
   requests at once; 400 or more is plenty for launch. Raising it is free and
   takes a day or so.

3. **Bootstrap CDK** in both regions it uses:

   ```sh
   ACCOUNT=$(aws-vault exec fg -- aws sts get-caller-identity --query Account --output text)
   aws-vault exec fg -- npx cdk bootstrap aws://$ACCOUNT/ap-south-1 aws://$ACCOUNT/us-east-1
   ```

4. **Store the runtime parameters.** Every name in `RUNTIME_PARAMETERS`
   (`lib/config.ts`) must exist before the first deploy, as a **String**
   parameter (CloudFormation cannot put a SecureString into a Lambda's
   environment; IAM still decides who can read it):

   ```sh
   put() { aws-vault exec fg -- aws ssm put-parameter --region ap-south-1 \
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
   SITE_GATE=x:x aws-vault exec fg -- npx cdk deploy FewgramsOps
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
   - `curl -I <SiteUrl>/.env` answers **404** without a password prompt (the
     scanner block, `lib/scanner-block.ts`)
   - in the Razorpay dashboard, set the webhook to
     `<SiteUrl>/api/payments/razorpay/webhook` and send a test event: it must
     return **200**, not 403 (403 means the body-hash Lambda@Edge is not
     signing — see `lib/webhook-signing.ts`)
   - CloudWatch → Log groups: every `/aws/lambda/…` group shows 1 week's
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

## Without a WAF

There is no WAF (SPEC §2.2). What stands in for one:

- **The site gate** (`lib/site-gate.ts`) — while private, everything but the
  payment webhooks gets a 401 at CloudFront and never reaches the Lambda.
- **The scanner block** (`lib/scanner-block.ts`) — `/.env`, `*.php`,
  `/wp-admin` and the like get a 404 at CloudFront, public or not.
- **No way round CloudFront** — the Lambda's Function URL takes only requests
  CloudFront has signed (`AWS_IAM` + Origin Access Control); S3 likewise.
- **Cost ceilings** — the Lambda serves at most `MAX_CONCURRENCY` requests at
  once and each table is capped in request units per second (`lib/config.ts`).
  A flood is throttled instead of billed; the budget alarms email at $0 and $10.
- **AWS Shield Standard** — on every CloudFront distribution, free, against
  network-level floods.
- **In the app** — roles checked on every admin page and server action, the
  magic-link limit, payment webhooks verified by signature and settled server
  to server, Google sign-ins accepted only for a Google-verified address,
  and no off-site `callbackUrl` redirects.
- **Security headers** — HSTS, `nosniff`, frame options and referrer policy
  from cdk-nextjs's response-headers policies; Content-Security-Policy,
  Permissions-Policy and COOP from the app (`src/lib/security-headers.ts`).
- **Patched dependencies** — `npm audit --omit=dev` should report 0. Next.js
  advisories have included SSRF and cache poisoning on self-hosted sites like
  this one, so upgrade promptly when it does not.

CloudFront's flat-rate **Free** plan includes a WAF with rate limiting and has
no overage charges, but allows 5 cache behaviors; cdk-nextjs makes one per
top-level `public/` entry, 20 in all. Moving `public/` under a single folder
would be the way in, if the bill or the bots ever call for it.

## Costs to watch

At launch traffic the bill is cents (SPEC §2.2). What can change that:

- **A VPC or NAT Gateway** — ~$45/month. Nothing here needs one.
- **`…Containers` constructs** from cdk-nextjs — $120–140/month. Functions only.
- **CloudWatch log ingestion over 5 GB/month** — the first allowance a busy
  site exceeds. Retention does not help here — ingestion is what is billed —
  so log less in production.
- **Old Lambda bundles** are deleted by the last step of every deploy (`cdk
  gc`), and the space is freed 30 days later when the bucket's lifecycle drops
  the deleted versions. A deploy run from a laptop skips that step; run
  `aws-vault exec fg -- npx cdk gc --unstable=gc --type=s3` afterwards.

## Upgrading cdk-nextjs

It is experimental and pinned to an exact version. Read its release notes
before bumping it — especially for anything touching the viewer-request
CloudFront function, which `lib/site-gate.ts` edits (synth fails loudly if
that function's shape changes) — then check the CI synth and a deploy.
