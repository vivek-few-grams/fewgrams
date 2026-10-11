/**
 * One way out for every message the app sends — SPEC §11. Email only in v1;
 * a WhatsApp or SMS adapter is another implementation of this, not a change to
 * the code that decides *what* to say.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body, for clients that do not render HTML and for filters. */
  text: string;
  html: string;
};

export interface NotificationProvider {
  readonly name: string;
  sendEmail(message: EmailMessage): Promise<void>;
}
