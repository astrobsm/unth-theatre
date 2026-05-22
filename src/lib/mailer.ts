/**
 * Outbound email helper for UNTH Theatre Manager.
 *
 * Configuration (env vars — set in Vercel / .env.local):
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       e.g. 587  (or 465 for implicit TLS)
 *   SMTP_USER       SMTP username
 *   SMTP_PASS       SMTP password / app password
 *   SMTP_SECURE     "true" for port 465, "false" (default) for 587/STARTTLS
 *   SMTP_FROM       "UNTH Theatre Manager <no-reply@unth.example>"
 *
 * If SMTP credentials are missing the helper logs to console and resolves
 * successfully — never throws. This keeps preview / local dev usable.
 */

import nodemailer, { Transporter } from 'nodemailer';

let cached: Transporter | null | undefined;

function buildTransport(): Transporter | null {
  if (cached !== undefined) return cached;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass) {
    cached = null;
    return null;
  }

  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cached;
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailResult {
  ok: boolean;
  delivered: boolean;          // true when an SMTP transport actually sent it
  messageId?: string;
  error?: string;
}

export async function sendMail(opts: MailOptions): Promise<MailResult> {
  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    'UNTH Theatre Manager <no-reply@unth.local>';

  const transport = buildTransport();
  if (!transport) {
    console.warn(
      '[mailer] SMTP not configured — email logged but NOT sent. Set SMTP_HOST/SMTP_USER/SMTP_PASS to enable delivery.'
    );
    console.info('[mailer] would-send:', { from, to: opts.to, subject: opts.subject });
    return { ok: true, delivered: false };
  }

  try {
    const info = await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true, delivered: true, messageId: info.messageId };
  } catch (err: any) {
    console.error('[mailer] sendMail failed:', err);
    return { ok: false, delivered: false, error: err?.message ?? String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Pre-built templates                                                */
/* ------------------------------------------------------------------ */

export function usernameRecoveryEmail(params: {
  fullName: string;
  usernames: string[];
  loginUrl: string;
}): { subject: string; text: string; html: string } {
  const { fullName, usernames, loginUrl } = params;
  const list = usernames.map((u) => `  • ${u}`).join('\n');
  const subject = 'UNTH Theatre Manager — your username(s)';
  const text = [
    `Hello ${fullName || 'colleague'},`,
    '',
    'You (or someone using your email address) requested your username for the',
    'UNTH Theatre Manager.',
    '',
    `Account${usernames.length > 1 ? 's' : ''} registered to this email address:`,
    list,
    '',
    `Sign in here: ${loginUrl}`,
    '',
    'If you did not make this request, you can safely ignore this email.',
    '',
    '— UNTH Theatre Manager',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
      <h2 style="color:#0f766e;margin:0 0 8px">UNTH Theatre Manager</h2>
      <p>Hello <strong>${escapeHtml(fullName || 'colleague')}</strong>,</p>
      <p>You (or someone using your email address) requested your username.</p>
      <p style="margin:16px 0 4px"><strong>Account${usernames.length > 1 ? 's' : ''} registered to this email:</strong></p>
      <ul style="font-family:monospace;background:#f1f5f9;padding:12px 24px;border-radius:8px">
        ${usernames.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}
      </ul>
      <p>
        <a href="${loginUrl}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px">Sign in</a>
      </p>
      <p style="color:#64748b;font-size:12px;margin-top:32px">
        If you did not request this, you can safely ignore this email.<br/>
        — UNTH Theatre Manager
      </p>
    </div>`;
  return { subject, text, html };
}

export function passwordResetEmail(params: {
  fullName: string;
  resetUrl: string;
  expiresMinutes: number;
}): { subject: string; text: string; html: string } {
  const { fullName, resetUrl, expiresMinutes } = params;
  const subject = 'UNTH Theatre Manager — password reset link';
  const text = [
    `Hello ${fullName || 'colleague'},`,
    '',
    'A password reset was requested for your UNTH Theatre Manager account.',
    'Click the link below (or paste it into your browser) to choose a new password.',
    '',
    resetUrl,
    '',
    `This link expires in ${expiresMinutes} minutes.`,
    '',
    'If you did not request a reset, you can safely ignore this email — your',
    'password will not be changed.',
    '',
    '— UNTH Theatre Manager',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
      <h2 style="color:#0f766e;margin:0 0 8px">UNTH Theatre Manager</h2>
      <p>Hello <strong>${escapeHtml(fullName || 'colleague')}</strong>,</p>
      <p>A password reset was requested for your account. Click the button below to choose a new password.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Reset my password</a>
      </p>
      <p style="font-size:12px;color:#64748b">Or paste this link into your browser:<br/>
        <code style="word-break:break-all">${escapeHtml(resetUrl)}</code>
      </p>
      <p style="color:#b91c1c;font-weight:600">This link expires in ${expiresMinutes} minutes.</p>
      <p style="color:#64748b;font-size:12px;margin-top:32px">
        If you did not request a reset, you can safely ignore this email — your password will not be changed.<br/>
        — UNTH Theatre Manager
      </p>
    </div>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
