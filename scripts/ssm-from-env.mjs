#!/usr/bin/env node
/**
 * Copies runtime settings from `.env.local` into SSM Parameter Store, as
 * `/fewgrams/prod/<NAME>` String parameters — the ones `infra/lib/config.ts`
 * lists in `RUNTIME_PARAMETERS` and the Web stack puts on the Lambda.
 *
 *   node scripts/ssm-from-env.mjs NAME...           # dry run: set locally or not
 *   aws-vault exec fg -- node scripts/ssm-from-env.mjs --write NAME...
 *   node scripts/ssm-from-env.mjs --file .env.live NAME...   # from that file only
 *
 * ## `--file`: values production has and this laptop must not
 *
 * The live Razorpay keys (the owner, 8 Nov 2026). `.env.local` holds the
 * **test** keys that `next dev` uses, so putting live ones there would turn
 * local checkout into real money. They go in `.env.live` instead: git ignores
 * every `.env*`, and Next loads only `.env`, `.env.local` and
 * `.env.<mode>[.local]`, so nothing but this script ever reads it. Its values
 * are taken **literally** (`util.parseEnv`, no `$` expansion), so a `$` needs
 * no backslash there — unlike `.env.local`, below.
 *
 * ## Why a script instead of typing `aws ssm put-parameter`
 *
 * - **No value is printed or typed.** Each one goes to the AWS CLI in a file
 *   only the owner can read (`--cli-input-json`), deleted the moment the CLI
 *   has read it, so it never appears in a terminal, the shell history or the
 *   process list.
 * - **Values are read the way Next reads them** (`@next/env`). `.env.local`
 *   escapes `$` as `\$` for Next's parser; a raw copy sends the backslash too,
 *   and that wrong Shiprocket password locked the account on 25 Sep 2026.
 * - **Only `.env.local` and friends (or the one `--file`) are read**, never the shell's own
 *   environment, so a stray exported variable cannot go up by mistake.
 *
 * String, not SecureString: CloudFormation cannot put a SecureString into a
 * Lambda's environment (infra/README.md). IAM still decides who reads them.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import nextEnv from "@next/env";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATH_PREFIX = "/fewgrams/prod";
const REGION = "ap-south-1";

const args = process.argv.slice(2);
const write = args.includes("--write");
const fileAt = args.indexOf("--file");
const fromFile = fileAt === -1 ? null : args[fileAt + 1];
if (fileAt !== -1 && !/^\.env[\w.-]*$/.test(fromFile ?? "")) {
  /* A bare `.env…` name in the repository root, so it is always one git ignores. */
  console.error("--file takes a .env file name in the repository root, e.g. --file .env.live");
  process.exit(1);
}
const names = args.filter((a, i) => a !== "--write" && (fileAt === -1 || (i !== fileAt && i !== fileAt + 1)));
if (names.length === 0) {
  console.error("Name at least one setting, e.g. node scripts/ssm-from-env.mjs DELHIVERY_ENV");
  process.exit(1);
}
const bad = names.filter((n) => !/^[A-Z][A-Z0-9_]*$/.test(n));
if (bad.length) {
  console.error(`Not a setting name: ${bad.join(", ")}`);
  process.exit(1);
}

const source = fromFile ?? ".env.local";
let parsedEnv;
if (fromFile) {
  const file = path.join(ROOT, fromFile);
  if (!existsSync(file)) {
    console.error(`${fromFile} not found in ${ROOT}`);
    process.exit(1);
  }
  parsedEnv = parseEnv(readFileSync(file, "utf8"));
} else {
  ({ parsedEnv = {} } = nextEnv.loadEnvConfig(ROOT, true, { info() {}, error: console.error }));
}
const missing = names.filter((n) => !parsedEnv[n]);
for (const n of names) console.log(`${n}: ${parsedEnv[n] ? `set in ${source}` : "MISSING"}`);
if (missing.length) {
  console.error(`\nNothing written: ${missing.join(", ")} not set in ${source}.`);
  process.exit(1);
}
if (!write) {
  console.log("\nDry run. Add --write, under aws-vault exec fg, to put them.");
  process.exit(0);
}

/* One private folder (0700) and one file (0600) per value, removed as soon
   as the CLI has read it — the CLI cannot read stdin under every sandbox. */
const dir = mkdtempSync(path.join(tmpdir(), "ssm-"));
try {
  for (const name of names) {
    const file = path.join(dir, `${name}.json`);
    writeFileSync(
      file,
      JSON.stringify({ Name: `${PATH_PREFIX}/${name}`, Value: parsedEnv[name], Type: "String", Overwrite: true }),
      { mode: 0o600 },
    );
    const r = spawnSync(
      "aws",
      ["ssm", "put-parameter", "--region", REGION, "--cli-input-json", `file://${file}`, "--query", "Version", "--output", "text"],
      { encoding: "utf8" },
    );
    rmSync(file, { force: true });
    if (r.status !== 0) {
      /* The CLI's own error, which names the parameter but never the value. */
      console.error(`${name}: FAILED — ${r.stderr.trim()}`);
      process.exitCode = 1;
      break;
    }
    console.log(`${name}: written (version ${r.stdout.trim()})`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
