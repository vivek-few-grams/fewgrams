import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Which messages reach the browser, and where.
 *
 * Every message handed to `NextIntlClientProvider` is serialised into the
 * page's HTML, whether or not anything on the page reads it. The root layout
 * used to hand over every customer namespace — 54 KB in English and well over
 * twice that in Kannada, on every page, for the four client components in the
 * header and footer. Now the layout sends only `chrome`, and a page whose own
 * client components read messages wraps them in `ClientMessages` with its
 * entry here.
 *
 * **A nested provider replaces the messages above it; it does not add to
 * them** (use-intl's `IntlProvider`). So an entry lists everything the
 * components inside it read, and the chrome never sits inside one.
 *
 * `client-messages.test.ts` fails on a `useTranslations` in a client
 * component that no entry covers. It cannot tell whether the page wraps the
 * component — that is what the render check in the test is for.
 */
export const CLIENT_MESSAGES = {
  /** Header and footer: nav links, language switch, search box, garden badge. */
  chrome: ["common", "search", "garden.badge"],
  /** The plan cards (`Bundles`). */
  home: ["plans"],
  /** The play garden, which borrows the home page's tray words. */
  garden: ["garden", "home.trayPlay"],
  /** `/how-we-grow`'s book. */
  story: ["story"],
  /** `home.pinCheck` for `PinCheck`, kept for checkout to mount (SPEC §7). */
  checkout: ["cart", "checkout", "account.addresses", "home.pinCheck"],
  subscribe: ["checkout", "plans.subscribe"],
  account: ["account"],
} as const satisfies Record<string, readonly string[]>;

type Messages = Record<string, unknown>;

/** The named branches of `messages`, at any depth: `"home.trayPlay"` keeps
 *  `{ home: { trayPlay } }` and nothing else of `home`. */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
  const out: Messages = {};
  for (const path of paths) {
    const keys = path.split(".");
    let from: unknown = messages;
    for (const key of keys) from = (from as Messages | undefined)?.[key];
    if (from === undefined) continue;
    let into = out;
    for (const key of keys.slice(0, -1)) into = (into[key] ??= {}) as Messages;
    into[keys.at(-1)!] = from;
  }
  return out;
}

/** Hands one entry's messages to the client components inside it. */
export async function ClientMessages({
  entry,
  children,
}: {
  entry: keyof typeof CLIENT_MESSAGES;
  children: React.ReactNode;
}) {
  const messages = (await getMessages()) as Messages;
  return (
    <NextIntlClientProvider messages={pickMessages(messages, CLIENT_MESSAGES[entry])}>
      {children}
    </NextIntlClientProvider>
  );
}
