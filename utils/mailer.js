const nodemailer = require('nodemailer');
require('dotenv').config();

// ---------------------------------------------------------------------
// Delivery strategy
// ---------------------------------------------------------------------
// Render (and most free hosting tiers) block outbound traffic on SMTP
// ports 25 / 465 / 587, which is why raw SMTP (nodemailer) was timing
// out with "Connection timeout" in production. Brevo also exposes a
// plain HTTPS REST API (port 443, never blocked) that sends the exact
// same transactional emails without touching SMTP at all.
//
// If BREVO_API_KEY is set, we send over that HTTPS API. Otherwise we
// fall back to nodemailer/SMTP, which is fine for local development
// where SMTP ports usually aren't blocked.
// ---------------------------------------------------------------------

const useApi = Boolean(process.env.BREVO_API_KEY);

console.log('MAIL DELIVERY MODE:', useApi ? 'Brevo HTTPS API (recommended on Render free tier)' : 'SMTP via nodemailer');

let transporter = null;

if (!useApi) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });

  transporter.verify((error) => {
    if (error) {
      console.error('❌ SMTP VERIFY ERROR:', error.message);
      console.error('   If this is running on Render\'s free tier, outbound SMTP ports (25/465/587) are blocked.');
      console.error('   Set BREVO_API_KEY in your environment to send over HTTPS instead.');
    } else {
      console.log('✅ SMTP READY');
    }
  });
}

// From header / sender
const fromName = process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'App';
const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
const fromHeader = `"${fromName}" <${fromEmail}>`;

async function sendViaBrevoApi({ to, subject, html, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }

  return res.json();
}

async function sendViaSmtp({ to, subject, html, text }) {
  return transporter.sendMail({ from: fromHeader, to, subject, html, text });
}

// Generic mail sender
async function sendMail({ to, subject, html, text }) {
  try {
    console.log('📨 Sending email to:', to);

    const info = useApi
      ? await sendViaBrevoApi({ to, subject, html, text })
      : await sendViaSmtp({ to, subject, html, text });

    console.log('✅ Email sent successfully');
    return info;
  } catch (error) {
    console.error('❌ EMAIL SEND ERROR:', error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------
// Verification email — 6-digit code, neon themed
// ---------------------------------------------------------------------
async function sendVerificationCodeEmail(to, code) {
  const appName = process.env.APP_NAME || 'your account';
  return sendMail({
    to,
    subject: `${code} is your ${appName} verification code`,
    html: `
      <div style="background:#05060a;padding:40px 16px;font-family:'Courier New',monospace;">
        <div style="max-width:480px;margin:auto;background:#0b0e14;border:1px solid #1d2b3a;border-radius:14px;padding:36px 30px;box-shadow:0 0 40px rgba(0,255,200,0.08);">
          <p style="margin:0 0 6px;color:#3dffc0;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;text-shadow:0 0 8px rgba(61,255,192,0.8);">
            ${appName}
          </p>
          <h1 style="margin:0 0 18px;color:#f5fbff;font-size:20px;font-weight:600;">
            Verify your email
          </h1>
          <p style="margin:0 0 26px;color:#8fa3b8;font-size:14px;line-height:1.6;">
            Enter this code to finish creating your account. It expires in 10 minutes.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <span style="display:inline-block;padding:18px 26px;font-size:38px;font-weight:700;letter-spacing:0.35em;color:#3dffc0;background:#081410;border:1px solid #1d5c48;border-radius:10px;text-shadow:0 0 6px rgba(61,255,192,0.9),0 0 22px rgba(61,255,192,0.55);">
              ${code}
            </span>
          </div>
          <p style="margin:26px 0 0;color:#516276;font-size:12.5px;line-height:1.6;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      </div>
    `,
    text: `Your ${appName} verification code is ${code}. It expires in 10 minutes.`
  });
}

// ---------------------------------------------------------------------
// Password reset email (unchanged — still link based)
// ---------------------------------------------------------------------
async function sendPasswordResetEmail(to, link) {
  return sendMail({
    to,
    subject: `Reset your ${process.env.APP_NAME || 'account'} password`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2>Reset your password</h2>
        <p>We received a request to reset your password.</p>
        <p style="margin:30px 0;">
          <a href="${link}"
             style="background:#dc2626;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
            Reset Password
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this link:</p>
        <p><a href="${link}">${link}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you did not request this reset, you can ignore this email.</p>
      </div>
    `,
    text: `Reset your password: ${link}`
  });
}

module.exports = {
  transporter,
  sendMail,
  sendVerificationCodeEmail,
  sendPasswordResetEmail
};
