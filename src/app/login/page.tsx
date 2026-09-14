import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { brand } from "@/lib/brand";
import { Sprout } from "@/components/ui/Sprout";

/**
 * Sign in — SPEC §8.1. Google SSO + email magic link, no passwords.
 *
 * The Google button only renders when AUTH_GOOGLE_ID is set, so the whole
 * flow is usable with magic links alone and no Google project.
 */
export const dynamic = "force-dynamic";

const googleConfigured =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email is already registered with a different sign-in method. Use the one you signed up with.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  AccessDenied: "You cancelled the sign-in, or access was refused.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const errorCode = typeof params.error === "string" ? params.error : undefined;

  // Already signed in — no reason to show a login form.
  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-sage">
          <Sprout className="size-7" stroke="#033923" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-forest">
            Sign in
          </h1>
          <p className="font-body text-sm text-stone">to {brand.name}</p>
        </div>
      </div>

      {errorCode && (
        <p className="mb-6 rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 font-body text-sm text-ink">
          {ERRORS[errorCode] ?? "Something went wrong signing you in. Try again."}
        </p>
      )}

      {googleConfigured && (
        <>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-full border border-forest/25 px-5 py-3 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
            >
              Continue with Google
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-forest/15" />
            <span className="font-body text-xs uppercase tracking-widest text-stone">
              or
            </span>
            <span className="h-px flex-1 bg-forest/15" />
          </div>
        </>
      )}

      <form
        action={async (formData: FormData) => {
          "use server";
          await signIn("email", {
            email: String(formData.get("email") ?? "").trim(),
            redirectTo: callbackUrl,
          });
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
            Email
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2.5 font-body text-sm outline-none placeholder:text-stone/50 focus:border-forest"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-forest px-5 py-3 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          Email me a sign-in link
        </button>
      </form>

      <p className="mt-8 font-body text-xs leading-relaxed text-stone">
        We&apos;ll email you a link instead of asking for a password — there is no
        password to forget or to leak. The link is valid for 15 minutes.
      </p>

      {!googleConfigured && (
        <p className="mt-6 rounded-xl bg-sand px-4 py-3 font-body text-xs text-stone">
          <strong className="font-semibold text-forest">Dev note:</strong> Google
          sign-in is hidden because <code>AUTH_GOOGLE_ID</code> is not set. In
          development the sign-in link is printed to the terminal running{" "}
          <code>npm run dev</code> — no email is sent.
        </p>
      )}

      <Link
        href="/"
        className="mt-10 font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
      >
        ← Back to {brand.name}
      </Link>
    </div>
  );
}
