import { ClientMessages } from "@/i18n/client-messages";

/** Hands this page's client components their messages — the layout above
 *  sends only the header's and footer's (`CLIENT_MESSAGES`). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientMessages entry="checkout">{children}</ClientMessages>;
}
