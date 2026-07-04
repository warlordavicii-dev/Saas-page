const IS_LIVE_BASE = 'https://api.intasend.com/api/v1';
const IS_TEST_BASE = 'https://sandbox.intasend.com/api/v1';
const IS_BASE = process.env.INTASEND_TEST_MODE === 'true' ? IS_TEST_BASE : IS_LIVE_BASE;

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.INTASEND_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Initiates an M-Pesa STK push directly to the customer's phone.
 * api_ref carries our internal tx_ref so we can match it up later via
 * the payment-status check or the collection webhook.
 */
async function chargeMpesaSTK({ txRef, amount, phoneNumber }) {
  const res = await fetch(`${IS_BASE}/payment/mpesa-stk-push/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      amount,
      phone_number: phoneNumber,
      api_ref: txRef
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Failed to initiate M-Pesa STK push');
  }
  return data;
}

/**
 * Creates a hosted checkout link for card / bank (PesaLink) deposits.
 * We leave `method` unset so IntaSend shows the customer all enabled
 * payment options on the hosted page.
 */
async function createHostedCheckout({ txRef, amount, email, name, redirectUrl }) {
  const parts = (name || 'Customer').trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || parts[0];

  const res = await fetch(`${IS_BASE}/checkout/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      email,
      host: process.env.APP_URL,
      amount,
      currency: 'KES',
      api_ref: txRef,
      redirect_url: redirectUrl,
      channel: 'WEBSITE'
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Failed to create checkout link');
  }
  return data;
}

/**
 * Always re-verify a transaction server-side using IntaSend's own record
 * before crediting a wallet. Never trust the webhook payload or a client
 * redirect alone — both can be spoofed or replayed.
 */
async function verifyPayment(invoiceId) {
  const res = await fetch(`${IS_BASE}/payment/status/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ invoice_id: invoiceId })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Failed to verify payment');
  }
  // IntaSend nests the record under `invoice` on some accounts and returns
  // it flat on others — normalize so callers don't have to care.
  return data.invoice || data;
}

/**
 * Initiates a payout (withdrawal) to M-Pesa or a Kenyan bank account via
 * PesaLink. requires_approval is 'NO' so it's a single straight-through
 * call, matching how this app previously used Flutterwave transfers.
 * We stamp our tx_ref onto idempotency_key so the send-money webhook can
 * match the result back to the right transaction.
 */
async function initiateTransfer({ txRef, amount, channel, accountNumber, bankCode, beneficiaryName }) {
  const provider = channel === 'bank' ? 'PESALINK' : 'MPESA-B2C';

  const transaction = {
    name: beneficiaryName,
    account: accountNumber,
    amount,
    narrative: 'VaultGate withdrawal',
    idempotency_key: txRef
  };
  if (provider === 'PESALINK') {
    transaction.bank_code = bankCode;
  }

  const res = await fetch(`${IS_BASE}/send-money/initiate/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      currency: 'KES',
      provider,
      requires_approval: 'NO',
      callback_url: `${process.env.APP_URL}/webhooks/intasend`,
      transactions: [transaction]
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Failed to initiate withdrawal');
  }
  return data;
}

module.exports = {
  chargeMpesaSTK,
  createHostedCheckout,
  verifyPayment,
  initiateTransfer
};
