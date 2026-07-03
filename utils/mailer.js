const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('SMTP CONFIG:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER,
  from: process.env.SMTP_FROM_EMAIL
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  requireTLS: true,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },

  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
});

transporter.verify((err) => {
  if (err) {
    console.error('SMTP VERIFY ERROR:', err);
  } else {
    console.log('SMTP READY');
  }
});

const fromHeader = `"${process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'App'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;

async function sendMail({ to, subject, html, text }) {
  console.log('Sending email to:', to);

  const info = await transporter.sendMail({
    from: fromHeader,
    to,
    subject,
    html,
    text
  });

  console.log('Email sent:', info.messageId);
  return info;
}

async function sendVerificationEmail(to, link) {
  return sendMail({
    to,
    subject: `Verify your ${process.env.APP_NAME || 'account'}`,
    html: `
      <h2>Confirm your email</h2>
      <p>Please click the link below to verify your account:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
    text: `Verify your account: ${link}`
  });
}

async function sendPasswordResetEmail(to, link) {
  return sendMail({
    to,
    subject: `Reset your ${process.env.APP_NAME || 'account'} password`,
    html: `
      <h2>Reset your password</h2>
      <p>Click the link below to reset your password:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 1 hour.</p>
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
