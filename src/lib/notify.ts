import { sendAppEmail, type SendAppEmailInput } from "@/lib/email.functions";

/**
 * Fire-and-forget email. Emails are a courtesy on top of in-app notifications:
 * if they fail or no key is configured, the app carries on silently.
 */
export function notifyByEmail(input: SendAppEmailInput) {
  if (input.profileIds.length === 0) return;
  void sendAppEmail({ data: input }).catch(() => undefined);
}
