const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const { requireAuth } = require('../middleware/auth');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const flw = require('../utils/flutterwave');

const MIN_AMOUNT_KES = 10;
const MAX_AMOUNT_KES = 150000; // adjust to your KYC tier's limits

function toCents(kes) {
  return Math.round(Number(kes) * 100);
}

function newTxRef(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// ---------- FUNDS DASHBOARD ----------
router.get('/funds', requireAuth, async (req, res) => {
  // If the person is bouncing back from a hosted checkout redirect, confirm
  // that specific transaction now rather than waiting for the webhook.
  const { tx_ref, transaction_id } = req.query;
  if (tx_ref && transaction_id) {
    await confirmDeposit(tx_ref, transaction_id).catch((err) => {
      console.error('Deposit confirmation on redirect failed:', err.message);
    });
  }

  const wallet = await Wallet.getOrCreate(req.user.id);
  const transactions = await Transaction.listForUser(req.user.id, 20);

  res.render('funds', {
    title: 'Funds',
    wallet,
    transactions,
    minAmount: MIN_AMOUNT_KES,
    maxAmount: MAX_AMOUNT_KES
  });
});

// ---------- DEPOSIT ----------
router.post(
  '/funds/deposit',
  requireAuth,
  [
    body('channel').isIn(['mpesa', 'airtel', 'bank']),
    body('amount').isFloat({ min: MIN_AMOUNT_KES, max: MAX_AMOUNT_KES }),
    body('phone')
      .if(body('channel').isIn(['mpesa', 'airtel']))
      .matches(/^2547\d{8}$|^2541\d{8}$/)
      .withMessage('Enter phone as 2547XXXXXXXX or 2541XXXXXXXX')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach((e) => req.flash('error', e.msg));
      return res.redirect('/funds');
    }

    const { channel, phone } = req.body;
    const amountKES = Number(req.body.amount);
    const txRef = newTxRef('DEP');

    try {
      await Transaction.create({
        userId: req.user.id,
        type: 'deposit',
        channel,
        amountCents: toCents(amountKES),
        txRef,
        destination: channel === 'bank' ? 'hosted-checkout' : phone
      });

      if (channel === 'mpesa' || channel === 'airtel') {
        await flw.chargeMobileMoneyKE({
          txRef,
          amount: amountKES,
          email: req.user.email,
          phoneNumber: phone,
          name: req.user.name
        });
        req.flash('success', 'Check your phone to approve the payment prompt.');
        return res.redirect('/funds');
      }

      // Bank / card -> hosted checkout, Flutterwave redirects back to /funds
      const redirectUrl = `${process.env.APP_URL}/funds`;
      const checkout = await flw.createHostedCheckout({
        txRef,
        amount: amountKES,
        email: req.user.email,
        name: req.user.name,
        redirectUrl
      });

      return res.redirect(checkout.data.link);
    } catch (err) {
      console.error('Deposit initiation failed:', err.message);
      await Transaction.markFailed(txRef, err.message);
      req.flash('error', 'Could not start the deposit. Please try again.');
      return res.redirect('/funds');
    }
  }
);

// ---------- WITHDRAW ----------
router.post(
  '/funds/withdraw',
  requireAuth,
  [
    body('channel').isIn(['mpesa', 'airtel', 'bank']),
    body('amount').isFloat({ min: MIN_AMOUNT_KES, max: MAX_AMOUNT_KES }),
    body('accountNumber').trim().notEmpty().withMessage('Enter a phone number or account number'),
    body('bankCode')
      .if(body('channel').equals('bank'))
      .trim()
      .notEmpty()
      .withMessage('Enter your bank code')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach((e) => req.flash('error', e.msg));
      return res.redirect('/funds');
    }

    const { channel, accountNumber } = req.body;
    const amountKES = Number(req.body.amount);
    const amountCents = toCents(amountKES);
    const txRef = newTxRef('WD');
    const bankCode = channel === 'mpesa' ? 'MPS' : channel === 'airtel' ? 'AIRTEL' : req.body.bankCode;

    const hasFunds = await Wallet.debitIfSufficient(req.user.id, amountCents);
    if (!hasFunds) {
      req.flash('error', 'Insufficient balance for that withdrawal.');
      return res.redirect('/funds');
    }

    try {
      await Transaction.create({
        userId: req.user.id,
        type: 'withdrawal',
        channel,
        amountCents,
        txRef,
        destination: accountNumber
      });

      await flw.initiateTransfer({
        txRef,
        amount: amountKES,
        bankCode,
        accountNumber,
        beneficiaryName: req.user.name,
        senderName: req.user.name
      });

      req.flash('success', 'Withdrawal is processing — it may take a few minutes.');
    } catch (err) {
      console.error('Withdrawal failed:', err.message);
      await Transaction.markFailed(txRef, err.message);
      await Wallet.refund(req.user.id, amountCents);
      req.flash('error', 'Withdrawal could not be processed. Your balance has been restored.');
    }

    res.redirect('/funds');
  }
);

// ---------- SHARED CONFIRMATION LOGIC ----------
// Always re-verifies against Flutterwave's own record before crediting —
// never trusts a webhook payload or redirect query string by itself.
async function confirmDeposit(txRef, flwTransactionId) {
  const txn = await Transaction.findByRef(txRef);
  if (!txn || txn.status !== 'pending') return; // already handled, or unknown ref

  const verified = await flw.verifyTransaction(flwTransactionId);
  const data = verified.data;

  const amountMatches = Math.round(data.amount * 100) === Number(txn.amount_cents);
  const isGood =
    data.status === 'successful' &&
    data.tx_ref === txRef &&
    data.currency === 'KES' &&
    amountMatches;

  if (isGood) {
    await Wallet.credit(txn.user_id, txn.amount_cents);
    await Transaction.markSuccessful(txRef, String(data.id));
  } else {
    await Transaction.markFailed(txRef, `Verification mismatch or failed status: ${data.status}`);
  }
}

// ---------- FLUTTERWAVE WEBHOOK ----------
// Registered without requireAuth — Flutterwave calls this directly.
// Mount this router's raw path in server.js BEFORE any auth-only middleware blocks it.
router.post('/webhooks/flutterwave', express.json(), async (req, res) => {
  const signature = req.headers['verif-hash'];
  if (!signature || signature !== process.env.FLW_WEBHOOK_SECRET_HASH) {
    return res.status(401).send('Invalid signature');
  }

  const payload = req.body;

  try {
    if (payload.event === 'charge.completed') {
      await confirmDeposit(payload.data.tx_ref, payload.data.id);
    } else if (payload.event === 'transfer.completed') {
      const txn = await Transaction.findByRef(payload.data.reference);
      if (txn && txn.status === 'pending') {
        if (payload.data.status === 'SUCCESSFUL') {
          await Transaction.markSuccessful(payload.data.reference, String(payload.data.id));
        } else {
          await Transaction.markFailed(payload.data.reference, 'Transfer failed at provider');
          await Wallet.refund(txn.user_id, txn.amount_cents);
        }
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook handling error:', err.message);
    // Still 200 so Flutterwave doesn't hammer retries for a problem on our end
    // that a human needs to look at; the error is already logged above.
    res.status(200).send('logged');
  }
});

module.exports = router;
