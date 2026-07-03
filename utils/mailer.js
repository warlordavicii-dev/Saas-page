const nodemailer = require('nodemailer');
require('dotenv').config();

// Display SMTP configuration on startup
console.log('SMTP CONFIG:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER,
  from: process.env.SMTP_FROM_EMAIL
});

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,

  // false for port 587, true for port 465
  secure: process.env.SMTP_SECURE === 'true',

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },

  // Enable SMTP debugging
  logger: true,
  debug: true,

  // Increased timeouts for Render
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP VERIFY ERROR');
    console.error(error);
  } else {
    console.log('✅ SMTP READY');
  }
});

// Default From header
const fromHeader =
  `"${process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'App'}" ` +
  `<${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;

// Generic mail sender
async function sendMail({ to, subject, html, text }) {
  try {
    console.log(`📨 Sending email to ${to}`);

    const info = await transporter.sendMail({
      from: fromHeader,
      to,
      subject,
      html,
      text
    });

    console.log('✅ Email sent successfully');
    console.log('Message ID:', info.messageId);
    console.log('SMTP response:', info.response);
