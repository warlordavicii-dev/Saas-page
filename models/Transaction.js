const pool = require('../config/db');

function normalize(tx) {
  if (!tx) return null;

  return {
    id: tx.id,
    userId: tx.user_id,
    type: tx.type,
    channel: tx.channel,
    amountCents: Number(tx.amount_cents),
    txRef: tx.tx_ref,
    destination: tx.destination,
    status: tx.status,
    providerTransactionId: tx.provider_transaction_id,
    failureReason: tx.failure_reason,
    createdAt: tx.created_at,
    updatedAt: tx.updated_at
  };
}

const Transaction = {
  async create({
    userId,
    type,
    channel,
    amountCents,
    txRef,
    destination
  }) {
    await pool.query(
      `
      INSERT INTO transactions
      (
        user_id,
        type,
        channel,
        amount_cents,
        tx_ref,
        destination,
        status
      )
      VALUES
      (?, ?, ?, ?, ?, ?, 'pending')
      `,
      [
        userId,
        type,
        channel,
        amountCents,
        txRef,
        destination || null
      ]
    );
  },

  async findByRef(txRef) {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM transactions
      WHERE tx_ref = ?
      LIMIT 1
      `,
      [txRef]
    );

    return normalize(rows[0]);
  },

  async markSuccessful(
    txRef,
    providerTransactionId
  ) {
    await pool.query(
      `
      UPDATE transactions
      SET
        status = 'successful',
        provider_transaction_id = ?
      WHERE
        tx_ref = ?
        AND status = 'pending'
      `,
      [
        providerTransactionId,
        txRef
      ]
    );
  },

  async markFailed(
    txRef,
    reason
  ) {
    await pool.query(
      `
      UPDATE transactions
      SET
        status = 'failed',
        failure_reason = ?
      WHERE
        tx_ref = ?
        AND status = 'pending'
      `,
      [
        reason || 'Payment failed',
        txRef
      ]
    );
  },

  async listForUser(
    userId,
    limit = 20
  ) {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [userId, Number(limit)]
    );

    return rows.map(normalize);
  }
};

module.exports = Transaction;
