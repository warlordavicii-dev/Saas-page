const nodemailer = require('nodemailer');
require('dotenv').config();

// ---------------------------------------------------------------------
// Delivery strategy
// ---------------------------------------------------------------------
// If BREVO_API_KEY exists, use Brevo HTTPS API (works on Render Free).
// Otherwise, fall back to SMTP for local development.
// ---------------------------------------------------------------------

const useApi = Boolean(process.env.BREVO_API_KEY);

console.log(
  'MAIL DELIVERY MODE:',
  useApi
    ? 'Brevo HTTPS API'
    : 'SMTP via nodemailer'
);

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
      console.error(
        'If this is Render Free, SMTP ports are blocked. Use BREVO_API_KEY.'
      );
    } else {
      console.log('✅ SMTP READY');
    }
  });
}

// ---------------------------------------------------------------------
// Sender information
// ---------------------------------------------------------------------

const fromName =
  process.env.SMTP_FROM_NAME ||
  process.env.APP_NAME ||
  'App';

const fromEmail =
  process.env.SMTP_FROM_EMAIL ||
  process.env.SMTP_USER;

const fromHeader = `"${fromName}" <${fromEmail}>`;

// ---------------------------------------------------------------------
// Brevo API sender
// ---------------------------------------------------------------------

async function sendViaBrevoApi({
  to,
  subject,
  html,
  text
}) {
  const response = await fetch(
    'https://api.brevo.com/v3/smtp/email',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      })
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Brevo API error ${response.status}: ${body}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------
// SMTP sender
// ---------------------------------------------------------------------

async function sendViaSmtp({
  to,
  subject,
  html,
  text
}) {
  return transporter.sendMail({
    from: fromHeader,
    to,
    subject,
    html,
    text
  });
}

// ---------------------------------------------------------------------
// Generic sender
// ---------------------------------------------------------------------

async function sendMail({
  to,
  subject,
  html,
  text
}) {
  try {
    console.log('📨 Sending email to:', to);

    const result = useApi
      ? await sendViaBrevoApi({
          to,
          subject,
          html,
          text
        })
      : await sendViaSmtp({
          to,
          subject,
          html,
          text
        });

    console.log('✅ Email sent successfully');

    return result;
  } catch (error) {
    console.error(
      '❌ EMAIL SEND ERROR:',
      error.message
    );
    throw error;
  }
}

// ---------------------------------------------------------------------
// Verification email
// ---------------------------------------------------------------------

async function sendVerificationEmail(
  to,
  verificationLink
) {
  return sendMail({
    to,
    subject: `Verify your ${
      process.env.APP_NAME || 'account'
    }`,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2>Verify your email address</h2>

        <p>
          Thank you for signing up.
          Click the button below to verify your account.
        </p>

        <p style="margin:30px 0;">
          <a
            href="${verificationLink}"
            style="
              background:#2563eb;
              color:white;
              padding:12px 24px;
              border-radius:6px;
              text-decoration:none;
              display:inline-block;
            "
          >
            Verify Email
          </a>
        </p>

        <p>
          If the button doesn't work,
          copy and paste this link:
        </p>

        <p>
          <a href="${verificationLink}">
            ${verificationLink}
          </a>
        </p>

        <p>
          This link expires in 24 hours.
        </p>
      </div>
    `,

    text: `
Verify your account by visiting:

${verificationLink}

This link expires in 24 hours.
`
  });
}

// ---------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------

async function sendPasswordResetEmail(
  to,
  resetLink
) {
  return sendMail({
    to,
    subject: `Reset your ${
      process.env.APP_NAME || 'account'
    } password`,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2>Reset your password</h2>

        <p>
          We received a request to reset your password.
        </p>

        <p style="margin:30px 0;">
          <a
            href="${resetLink}"
            style="
              background:#dc2626;
              color:white;
              padding:12px 24px;
              border-radius:6px;
              text-decoration:none;
              display:inline-block;
            "
          >
            Reset Password
          </a>
        </p>

        <p>
          If the button doesn't work,
          copy and paste this link:
        </p>

        <p>
          <a href="${resetLink}">
            ${resetLink}
          </a>
        </p>

        <p>
          This link expires in 1 hour.
        </p>
      </div>
    `,

    text: `
Reset your password:

${resetLink}

This link expires in 1 hour.
`
  });
}

module.exports = {
  transporter,
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
