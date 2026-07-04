// ---------- SHARED CONFIRMATION LOGIC (deposits) ----------
// Always verify against IntaSend's own record before crediting a wallet.
// Never trust a webhook payload or redirect query string alone.

async function confirmDepositByInvoice(invoiceId) {
  if (!invoiceId) return;

  // Fetch authoritative payment information from IntaSend
  const info = await isend.verifyPayment(invoiceId);

  const txRef = info.api_ref;
  if (!txRef) return;

  // Find our internal transaction
  const txn = await Transaction.findByRef(txRef);
  if (!txn) return;

  // Already processed
  if (txn.status !== 'pending') {
    return;
  }

  // Normalize payment state
  const paymentState = String(
    info.state || ''
  ).toUpperCase();

  // Normalize currency
  const currency = String(
    info.currency || ''
  ).toUpperCase();

  // IntaSend field names vary by account type
  const paidAmount = Math.round(
    Number(
      info.value ??
      info.amount ??
      info.net_amount ??
      info.invoice_amount ??
      0
    ) * 100
  );

  // Support either camelCase or snake_case transaction schemas
  const expectedAmount = Number(
    txn.amountCents ??
    txn.amount_cents ??
    0
  );

  const userId =
    txn.userId ??
    txn.user_id;

  const amountMatches =
    paidAmount === expectedAmount;

  // Successful payment
  if (
    paymentState === 'COMPLETE' &&
    currency === 'KES' &&
    amountMatches
  ) {
    // Credit wallet
    await Wallet.credit(
      userId,
      expectedAmount
    );

    // Mark transaction successful
    await Transaction.markSuccessful(
      txRef,
      String(invoiceId)
    );

    return;
  }

  // Failed payment
  if (paymentState === 'FAILED') {
    await Transaction.markFailed(
      txRef,
      info.failed_reason ||
      `Payment failed (${paymentState})`
    );

    return;
  }

  // PENDING / PROCESSING remain pending
}
