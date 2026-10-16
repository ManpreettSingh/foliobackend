import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends a transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * With no RESEND_API_KEY the message is printed to the console in development so the flow can be
 * tested locally; in production a missing key is a configuration error.
 */
export async function sendEmail({ to, subject, html, text }: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY is not set; cannot send email.");
      throw new HttpError(503, "Email service is not configured. Please try again later.");
    }
    console.log(`\n[email:dev] RESEND_API_KEY not set — would send to ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}\n`);
    return;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }),
    });
  } catch (err) {
    console.error("[email] Could not reach Resend:", err);
    throw new HttpError(502, "Could not send the verification email. Please try again.");
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`[email] Resend rejected the email (${response.status}): ${body}`);
    // 403/422 usually means the sender domain isn't verified or, with onboarding@resend.dev,
    // the recipient isn't the Resend account owner. Detail stays in the server log.
    throw new HttpError(502, "Could not send the verification email. Please check the address and try again.");
  }
}

export function verificationEmail(code: string, minutes: number): Omit<Email, "to"> {
  const subject = `${code} is your Folio verification code`;
  const text = `Your Folio verification code is ${code}.\n\nIt expires in ${minutes} minutes. If you didn't try to create a Folio account, you can ignore this email.`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1a1f36">
    <h2 style="margin:0 0 8px">Verify your email</h2>
    <p style="margin:0 0 20px;color:#4b5563">Enter this code in Folio to finish creating your account.</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:700;background:#f3f4f6;border-radius:8px;padding:16px;text-align:center">${code}</div>
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px">This code expires in ${minutes} minutes. If you didn't try to create a Folio account, you can safely ignore this email.</p>
  </div>`;
  return { subject, html, text };
}
