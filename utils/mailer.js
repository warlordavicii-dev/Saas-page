require('dotenv').config();

// -----------------------------------------------------
// Configuration
// -----------------------------------------------------

const fromName =
  process.env.SMTP_FROM_NAME ||
  process.env.APP_NAME ||
  'App';

const fromEmail =
  process.env.SMTP_FROM_EMAIL;

console.log('MAIL DELIVERY MODE: Brevo HTTPS API');

if (!process.env.BREVO_API_KEY) {
  throw new Error(
    'BREVO_API_KEY environment variable is missing'
  );
}

// -----------------------------------------------------
// Generic sender
// -----------------------------------------------------

async function sendMail({
  to,
  subject,
  html,
  text
}) {
  try {
    console.log('📨 Sending email to:', to);

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
          to: [
            {
              email: to
            }
          ],
          subject,
          htmlContent: html,
          textContent: text
        })
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Brevo API ${response.status}: ${body}`
      );
    }

    const result = await response.json();

    console.log('✅ Email sent');
    console.log(result);

    return result;

  } catch (error) {
    console.error(
      '❌ EMAIL SEND ERROR:',
      error.message
    );
    throw error;
  }
}

// -----------------------------------------------------
// Email verification
// -----------------------------------------------------

async function sendVerificationEmail(
  to,
  verificationLink
) {
  return sendMail({
    to,
    subject: `Verify your ${process.env.APP_NAME || 'account'}`,

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
Verify your account:

${verificationLink}

This link expires in 24 hours.
`
  });
}

// -----------------------------------------------------
// Password reset
// -----------------------------------------------------

async function sendPasswordResetEmail(
  to,
  resetLink
) {
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
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
