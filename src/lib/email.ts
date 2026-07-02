import "server-only";
import { Resend } from "resend";
import { env } from "./env";

interface SendResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

/**
 * Sends the email-verification message via Resend. If no API key is configured
 * (local dev), it logs the link to the server console instead of failing — so
 * the full registration flow still works end-to-end before Resend is wired up.
 */
export async function sendVerificationEmail(
  to: string,
  fullName: string,
  verifyUrl: string,
): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping send.\n  → Verification link for ${to}: ${verifyUrl}`,
    );
    return { ok: true, skipped: true };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const firstName = fullName.trim().split(/\s+/)[0] || "there";

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Confirm your email — Valiant Movement",
    html: verificationHtml(firstName, verifyUrl),
    text: `Hi ${firstName},\n\nConfirm your email to activate your Valiant Movement membership:\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nCourage to Lead.\nValiant Movement`,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

function verificationHtml(firstName: string, url: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f5f2;font-family:Arial,Helvetica,sans-serif;color:#1a1410;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #ece7e0;border-radius:16px;overflow:hidden;">
          <tr><td style="background:#f7931e;padding:22px 28px;">
            <span style="font-size:20px;font-weight:800;letter-spacing:.3px;color:#1a1410;">VALIANT</span>
            <span style="font-size:20px;font-weight:800;letter-spacing:.3px;color:#ffffff;"> MOVEMENT</span>
            <div style="font-size:11px;letter-spacing:3px;color:#1a1410;margin-top:2px;">COURAGE TO LEAD</div>
          </td></tr>
          <tr><td style="padding:32px 28px 8px;">
            <h1 style="margin:0 0 12px;font-size:22px;">Confirm your email, ${firstName}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#423a33;">
              Welcome to the movement. Click the button below to verify your email and
              activate your membership.
            </p>
            <a href="${url}" style="display:inline-block;background:#f7931e;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">
              Verify my email
            </a>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#7a7068;">
              Or paste this link into your browser:<br>
              <a href="${url}" style="color:#e07400;word-break:break-all;">${url}</a>
            </p>
            <p style="margin:20px 0 0;font-size:12px;color:#a8a098;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
          </td></tr>
          <tr><td style="padding:24px 28px;border-top:1px solid #f3efe9;font-size:12px;color:#a8a098;">
            Valiant Movement · Courage to Lead
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
