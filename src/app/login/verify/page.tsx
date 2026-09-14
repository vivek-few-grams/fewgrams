import Link from "next/link";
import { Mail } from "lucide-react";

export default function VerifyPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <span className="grid size-12 place-items-center rounded-full bg-sage text-forest">
        <Mail size={22} strokeWidth={1.5} />
      </span>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-forest">
        Check your email
      </h1>
      <p className="mt-3 font-body text-sm leading-relaxed text-stone">
        We&apos;ve sent a sign-in link. It&apos;s valid for 15 minutes and can only be
        used once. You can close this tab.
      </p>
      <p className="mt-6 rounded-xl bg-sand px-4 py-3 font-body text-xs text-stone">
        <strong className="font-semibold text-forest">In development</strong> no email
        is sent — the link is printed in the terminal running{" "}
        <code>npm run dev</code>.
      </p>
      <Link
        href="/login"
        className="mt-8 font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
      >
        ← Use a different email
      </Link>
    </div>
  );
}
