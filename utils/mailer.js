const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587/25
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

const fromHeader = `"${process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'App'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;

async function sendMail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: fromHeader,
    to,
    subject,
    html,
    text
  });
}

function sendVerificationEmail(to, link) {
  return sendMail({
    to,
    subject: `Verify your ${process.env.APP_NAME || 'account'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;">
        <h2 style="color:#1b2a4a;">Confirm your email</h2>
        <p>Thanks for signing up. Click the button below to verify your email address. This link expires in 24 hours.</p>
        <p style="margin:32px 0;">
          <a href="${link}" style="background:#2f6f4f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Verify Email</a>
        </p>
        <p>Or paste this link into your browser:<br>${link}</p>
      </div>
    `,
    text: `Verify your email: ${link} (expires in 24 hours)`
  });
}

function sendPasswordResetEmail(to, link) {
  return sendMail({
    to,
    subject: `Reset your ${process.env.APP_NAME || 'account'} password`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;">
        <h2 style="color:#1b2a4a;">Reset your password</h2>
        <p>We received a request to reset your password. Click below to choose a new one. This link expires in 1 hour.</p>
        <p style="margin:32px 0;">
          <a href="${link}" style="background:#b5502f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset Password</a>
        </p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>Or paste this link into your browser:<br>${link}</p>
      </div>
    `,
    text: `Reset your password: ${link} (expires in 1 hour)`
  });
}

module.exports = { transporter, sendMail, sendVerificationEmail, sendPasswordResetEmail };
