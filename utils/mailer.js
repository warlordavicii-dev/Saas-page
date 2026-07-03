const nodemailer = require('nodemailer');
require('dotenv').config();

// Show SMTP configuration on startup
console.log('SMTP CONFIG:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER,
  from: process.env.SMTP_FROM_EMAIL
});

// Create transporter
const transporter = nodemailer.createTransport({
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

// Verify SMTP connection on startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ SMTP VERIFY ERROR:', error);
  } else {
    console.log('✅ SMTP READY');
  }
});

// From header
const fromHeader =
  `"${process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'App'}" ` +
  `<${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;

// Generic mail sender
async function sendMail({ to, subject, html, text }) {
  try {
    console.log('📨 Sending email to:', to);

    const info = await transporter.sendMail({
      from: fromHeader,
      to,
      subject,
      html,
      text
    });

    console.log('✅ Email sent successfully');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);

    return info;
  } catch (error) {
    console.error('❌ EMAIL SEND ERROR');
    console.error(error);
    throw error;
  }
}

// Verification email
async function sendVerificationEmail(to, link) {
  return sendMail({
    to,
    subject: `Verify your ${process.env.APP_NAME || 'account'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2>Verify your email address</h2>

        <p>
          Thank you for creating an account.
          Click the button below to verify your email address.
        </p>

        <p style="margin:30px 0;">
          <a href="${link}"
             style="
               background:#2563eb;
               color:#ffffff;
               padding:12px 24px;
               text-decoration:none;
               border-radius:6px;
               display:inline-block;
             ">
            Verify Email
          </a>
        </p>

        <p>
          If the button doesn't work, copy and paste this link:
        </p>

        <p>
          <a href="${link}">${link}</a>
        </p>

        <p>
          This link expires in 24 hours.
        </p>
      </div>
    `,
    text: `Verify your email: ${link}`
  });
}

// Password reset email
async function sendPasswordResetEmail(to, link) {
  return sendMail({
    to,
    subject: `Reset your ${process.env.APP_NAME || 'account'} password`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2>Reset your password</h2>

        <p>
          We received a request to reset your password.
        </p>

        <p style="margin:30px 0;">
          <a href="${link}"
             style="
               background:#dc2626;
               color:#ffffff;
               padding:12px 24px;
               text-decoration:none;
               border-radius:6px;
               display:inline-block;
             ">
            Reset Password
          </a>
        </p>

        <p>
          If the button doesn't work, copy and paste this link:
        </p>

        <p>
          <a href="${link}">${link}</a>
        </p>

        <p>
          This link expires in 1 hour.
        </p>

        <p>
          If you did not request this reset, you can ignore this email.
        </p>
      </div>
    `,
    text: `Reset your password: ${link}`
  });
}

module.exports = {
  transporter,
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
