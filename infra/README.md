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
then deploys **the app** — `FewgramsWeb` and the webhook signer's
`edge-lambda-stack-…` — about 6–10 minutes. **Actions → Deploy → Run
workflow** redeploys without a commit (after changing a parameter, say).

### Deployed from a laptop

`FewgramsData` (the tables) and `FewgramsOps` (the deploy role, the budgets)
are never deployed by the workflow — `--exclusively` leaves them out. A change
to either goes out from a laptop, after reading the preview:

```sh
SITE_GATE=x:x aws-vault exec fg -- npx cdk diff FewgramsData
SITE_GATE=x:x aws-vault exec fg -- npx cdk deploy FewgramsData
```

Deploy one of them before pushing an app change that needs it (a new table
index, say), or the app deploy fails on the missing export.

The split is about routine, not a hard wall: the deploy role uses CDK's
bootstrap roles, which can change any stack. What keeps the tables safe from a
bad deploy is deletion protection and `RETAIN` (`lib/data-stack.ts`).

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
   SITE_GATE=x:x aws-vault exec fg -- npx cdk bootstrap aws://$ACCOUNT/ap-south-1 aws://$ACCOUNT/us-east-1
   ```

   (`SITE_GATE` again only lets the app synthesize, as in step 5.)

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

   Then the tables, also by hand — the workflow never deploys them:

   ```sh
   SITE_GATE=x:x aws-vault exec fg -- npx cdk deploy FewgramsData
   ```

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

- **Sign-in email goes through Amazon SES** (`src/lib/notify`, SPEC §11) from
  `hello@fewgrams.com`. The identity is in `FewgramsOps`; its DKIM CNAMEs and
  the `mail.fewgrams.com` MX/TXT are the stack's `Mail*` outputs, added in
  Cloudflare as DNS-only. A new SES account is in the **sandbox** — it can
  send only to verified addresses — until production access is granted
  (SES console → Account dashboard → Request production access; free). New
  accounts also start on the Essentials plan ($0.16/1,000); switch to à la
  carte ($0.10/1,000) under SES → Plans.
- **The tables hold a copy of the local database** (11 Oct 2026), test orders
  and test users included. Clear those before taking real orders; keep the
  catalogue.
- **Opening the site:** set the repository variable `SITE_PUBLIC` to `true`,
  delete the `SITE_GATE` secret, and redeploy. With neither set, synth refuses
  to run — a forgotten secret cannot silently publish the site.

## Adding the domain

Done for fewgrams.com on 11 Oct 2026; the steps, for a move to another domain:

1. Set `DOMAIN_NAME` in `lib/config.ts`.
2. Deploy the certificate from a laptop — it is infrastructure, so the workflow
   never deploys it:
   `SITE_GATE=x:x aws-vault exec fg -- npx cdk deploy FewgramsCert`. It pauses
   until ACM sees its validation CNAME (ACM console, us-east-1): add that in
   Cloudflare as **DNS-only** and leave it there for good — renewal reuses it.
3. `put AUTH_URL https://<domain>`, then push: the workflow puts the domain on
   the distribution.
4. In Cloudflare, CNAME the domain to the `CloudFrontDomain` output, DNS-only.
   At the apex this sits beside the Zoho MX/TXT records; Cloudflare flattens it.
5. `www`: a proxied (orange) `www` record and a Cloudflare redirect rule to the
   apex — nothing in AWS.
6. Update the Google redirect URI and the Razorpay/Cashfree webhook URLs.

## Without a WAF

There is no AWS WAF (SPEC §2.2). What stands in for one:

- **The site gate** (`lib/site-gate.ts`) — while private, everything but the
  payment webhooks gets a 401 at CloudFront and never reaches the Lambda.
- **The scanner block** (`lib/scanner-block.ts`) — `/.env`, `*.php`,
  `/wp-admin` and the like get a 404 at CloudFront, public or not.
- **No way round CloudFront** — the Lambda's Function URL takes only requests
  CloudFront has signed (`AWS_IAM` + Origin Access Control); S3 likewise.
- **Cost ceilings** — the Lambda serves at most `MAX_CONCURRENCY` requests at
  once and each table is capped in request units per second (`lib/config.ts`).
  A flood is throttled instead of billed; the budget alarms email at $0 and $10.
- **Alarms** (`lib/alerts.ts`, 8 Nov 2026) — email `ALERT_EMAIL` within minutes
  when the Lambda throttles (visitors turned away), traffic surges past 3,000
  requests in five minutes, the app errors, or SES's bounce or complaint rate
  nears the level at which AWS reviews the account. Five of CloudWatch's ten
  free alarms. The SNS email subscription must be confirmed once, from the
  "AWS Notification - Subscription Confirmation" mail, or nothing arrives.
- **Cost Anomaly Detection** — a per-service monitor with a daily email over
  $1 of unexpected spend. Free; created by hand in the Fewgrams account
  (`aws ce create-anomaly-monitor`, 8 Nov 2026), not by a stack.
- **SES account-level suppression** for bounces and complaints (on), so an
  address that bounced is never mailed again.
- **AWS Shield Standard** — on every CloudFront distribution, free, against
  network-level floods.
- **In the app** — roles checked on every admin page and server action, the
  magic-link limits (two a day per address, and 1,000 a day for the whole site
  as a fuse against a bot typing new addresses), payment webhooks verified by
  signature and settled server to server, Google sign-ins accepted only for a
  Google-verified address, and no off-site `callbackUrl` redirects.
- **Security headers** — HSTS, `nosniff`, frame options and referrer policy
  from cdk-nextjs's response-headers policies; Content-Security-Policy,
  Permissions-Policy and COOP from the app (`src/lib/security-headers.ts`).
- **Patched dependencies** — `npm audit --omit=dev` should report 0. Next.js
  advisories have included SSRF and cache poisoning on self-hosted sites like
  this one, so upgrade promptly when it does not.

### The firewall is Cloudflare's (the owner, 8 Nov 2026)

The domain's DNS is already on Cloudflare. Its **free** plan, proxying
("orange cloud"), puts a WAF in front of CloudFront at $0 with no request cap:
unmetered DDoS protection at every layer, the Free Managed Ruleset, a few
custom rules (challenges included) and one rate-limiting rule. Chosen over:

- **CloudFront's flat-rate Free plan** ($0, AWS WAF with 5 rules and per-IP
  rate limiting, ~1M requests a month). The 5 cache behaviors fit since
  `public/` moved under `/img`, but the plan tiers allow only *managed* cache
  and response-headers policies below Business ($200/month), and cdk-nextjs
  makes two custom cache policies and three custom header policies. The
  header ones swap for `SecurityHeadersPolicy` easily; the image one cannot —
  every managed policy that keys on query strings also keys on `Host`, which
  breaks a Function URL origin, so `_next/image` would have to become prebuilt
  sizes in S3 first.
- **AWS WAF pay-as-you-go** — about $10 a month (web ACL $5 + $1 a rule +
  $0.60 per million requests), in us-east-1.

Turning it on, once Razorpay has approved the website:

1. Cloudflare → SSL/TLS: **Full (strict)** (CloudFront holds a valid
   certificate for the apex).
2. Leave **Bot Fight Mode off** — on the free plan it cannot be skipped for a
   path, and it would challenge Razorpay's webhooks. Leave "Block AI bots"
   off too (the owner allows AI crawlers, `src/app/robots.ts`).
3. Turn off **Email Address Obfuscation** and **Rocket Loader**: both rewrite
   the HTML, which breaks React hydration and the CSP.
4. A Cache Rule, **Bypass cache** for
   `(not starts_with(http.request.uri.path, "/_next/static/"))`. CloudFront
   stays the one cache for pages, `/img` and `/_next/image`, so a deploy's
   invalidation is the only purge they ever need — a photo replaced in place
   never goes stale at Cloudflare. `/_next/static/` is left to Cloudflare's
   own cache: those names are content hashes, new on every build, so a copy
   cannot be stale, and serving them from Cloudflare's edge saves the extra
   hop to CloudFront (measured 8 Nov 2026: ~41 ms → ~23 ms a file on a reused
   connection; straight to CloudFront is ~8 ms).
5. Generate a secret (`openssl rand -hex 32`); add a Transform Rule → Modify
   Request Header → set `x-origin-verify` to it, for all requests.
6. Switch the apex record to **Proxied**.
7. Put the same secret in the GitHub secret `CLOUDFLARE_ORIGIN_SECRET` and
   deploy: `lib/origin-lock.ts` then 403s anything that skipped Cloudflare
   (the `*.cloudfront.net` name included). Not before step 6, or every visitor
   gets the 403.
8. WAF rules: a rate limit on `POST /api/auth/signin/email` per IP, and skip
   the managed rules for `/api/payments/*/webhook` if they ever flag one.

**Undoing it is the reverse order:** clear `CLOUDFLARE_ORIGIN_SECRET` and
deploy *first*, then set the record back to DNS-only — otherwise the lock
turns everyone away.

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
