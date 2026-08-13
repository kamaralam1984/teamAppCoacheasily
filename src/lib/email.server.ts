/**
 * Branded email for CoachEasily, sent through Resend.
 * Dormant by design: with no RESEND_API_KEY the helper logs and skips, and the
 * whole app carries on working exactly as before.
 */

const MARK_PATH =
  "M50 0C50 0 41.6 34.3 22.4 61.9C10.9 78.4 0 91.3 0 108.1C0 128 22.4 144.1 50 144.1C77.6 144.1 100 128 100 108.1C100 91.3 89.1 78.4 77.6 61.9C58.4 34.3 50 0 50 0ZM50 78.5C50 78.5 55.2 96.2 64.6 110C70.2 118.3 75.6 124.6 75.6 132.9C71.5 134.9 61.9 137 50 137C38.1 137 28.5 134.9 24.4 132.9C24.4 124.6 29.8 118.3 35.4 110C44.8 96.2 50 78.5 50 78.5Z";

export interface AppEmail {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail(email: AppEmail): string {
  const body = email.lines
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#231C16">${escapeHtml(line)}</p>`,
    )
    .join("");

  const cta =
    email.ctaUrl && email.ctaLabel
      ? `<a href="${escapeHtml(email.ctaUrl)}" style="display:inline-block;margin-top:14px;padding:13px 22px;border-radius:12px;background:#C2560A;color:#FFFFFF;font:700 15px Arial,Helvetica,sans-serif;text-decoration:none">${escapeHtml(email.ctaLabel)}</a>`
      : "";

  return `<!doctype html><html><body style="margin:0;background:#FAF8F3">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F3;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-radius:20px;overflow:hidden;border:1px solid #EFE7DA">
        <tr><td style="background:#171126;padding:20px 24px" align="left">
          <svg width="22" height="32" viewBox="0 0 100 144.1" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle">
            <path fill="#FFC96B" d="${MARK_PATH}"/>
          </svg>
          <span style="margin-left:8px;font:700 19px Arial,Helvetica,sans-serif;color:#FFFFFF;vertical-align:middle">Coach<span style="color:#FFC96B">Easily</span></span>
        </td></tr>
        <tr><td style="background:#FFFDF8;padding:26px 24px">
          <h1 style="margin:0 0 14px;font:700 21px Arial,Helvetica,sans-serif;color:#231C16">${escapeHtml(email.heading)}</h1>
          ${body}
          ${cta}
        </td></tr>
        <tr><td style="background:#FFFDF8;border-top:1px solid #EFE7DA;padding:14px 24px">
          <p style="margin:0;font:400 12px Arial,Helvetica,sans-serif;color:#7A6D62">Sent by the CoachEasily team app.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendEmail(email: AppEmail): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    console.log(`[email] skipped (no RESEND_API_KEY): "${email.subject}" -> ${email.to}`);
    return { sent: false, reason: "no_key" };
  }
  if (!email.to || !email.to.includes("@")) return { sent: false, reason: "no_recipient" };

  const from = process.env["EMAIL_FROM"] ?? "CoachEasily <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: renderEmail(email),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[email] provider refused [${res.status}]: ${text}`);
      return { sent: false, reason: `provider_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { sent: false, reason: "network" };
  }
}
