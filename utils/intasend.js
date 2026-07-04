// services/intasend.js

// Uncomment if using Node < 18
// const fetch = require('node-fetch');

const IS_LIVE_BASE = 'https://api.intasend.com/api/v1';
const IS_TEST_BASE = 'https://sandbox.intasend.com/api/v1';

const IS_BASE =
  process.env.INTASEND_TEST_MODE === 'true'
    ? IS_TEST_BASE
    : IS_LIVE_BASE;

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return process.env[name];
}

requireEnv('INTASEND_SECRET_KEY');

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.INTASEND_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };
}

function normalizePhone(phone) {
  if (!phone) {
    throw new Error('Phone number is required');
  }

  phone = String(phone).replace(/\D/g, '');

  if (phone.startsWith('0')) {
    return `254${phone.substring(1)}`;
  }

  if (phone.startsWith('254')) {
    return phone;
  }

  throw new Error(
    'Invalid phone number format. Use Kenyan mobile numbers only.'
  );
}

async function parseResponse(res) {
  let data;

  try {
    data = await res.json();
  } catch {
    throw new Error(
      `IntaSend returned invalid JSON (${res.status})`
    );
  }

  if (!res.ok) {
    throw new Error(
      data.detail ||
      data.message ||
      data.error ||
      JSON.stringify(data)
    );
  }

  return data;
}

/**
 * Initiate M-Pesa STK Push
 */
async function chargeMpesaSTK({
  txRef,
  amount,
  phoneNumber,
  email = 'customer@example.com',
  firstName = 'Customer',
  lastName = 'User'
}) {
  const res = await fetch(
    `${IS_BASE}/payment/mpesa-stk-push/`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        amount: Number(amount),
        phone_number: normalizePhone(phoneNumber),
        email,
        first_name: firstName,
        last_name: lastName,
        api_ref: txRef
      })
    }
  );

  return parseResponse(res);
}

/**
 * Create hosted checkout
 */
async function createHostedCheckout({
  txRef,
  amount,
  email,
  name,
  redirectUrl
}) {
  const parts = (name || 'Customer')
    .trim()
    .split(/\s+/);

  const firstName = parts[0];
  const lastName =
    parts.slice(1).join(' ') || parts[0];

  const res = await fetch(
    `${IS_BASE}/checkout/`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        host: process.env.APP_URL,
        amount: Number(amount),
        currency: 'KES',
        api_ref: txRef,
        redirect_url: redirectUrl,
        channel: 'WEBSITE'
      })
    }
  );

  return parseResponse(res);
}

/**
 * Verify payment using invoice ID
 */
async function verifyPayment(invoiceId) {
  if (!invoiceId) {
    throw new Error('invoiceId is required');
  }

  const res = await fetch(
    `${IS_BASE}/payment/status/`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        invoice_id: invoiceId
      })
    }
  );

  const data = await parseResponse(res);

  return data.invoice || data;
}

/**
 * Initiate withdrawal
 */
async function initiateTransfer({
  txRef,
  amount,
  channel,
  accountNumber,
  bankCode,
  beneficiaryName
}) {
  const provider =
    channel === 'bank'
      ? 'PESALINK'
      : 'MPESA-B2C';

  const transaction = {
    name: beneficiaryName,
    account: accountNumber,
    amount: Number(amount),
    narrative: 'VaultGate withdrawal',
    idempotency_key: txRef
  };

  if (provider === 'PESALINK') {
    transaction.bank_code = bankCode;
  }

  const res = await fetch(
    `${IS_BASE}/send-money/initiate/`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        currency: 'KES',
        provider,
        requires_approval: 'NO',
        callback_url:
          `${process.env.APP_URL}/webhooks/intasend`,
        transactions: [transaction]
      })
    }
  );

  return parseResponse(res);
}

module.exports = {
  chargeMpesaSTK,
  createHostedCheckout,
  verifyPayment,
  initiateTransfer,
  normalizePhone
};
