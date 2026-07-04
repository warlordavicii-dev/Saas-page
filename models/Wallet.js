const pool = require('../config/db');

function normalize(wallet) {
  if (!wallet) return null;

  return {
    id: wallet.id,
    userId: wallet.user_id,
    balanceCents: Number(wallet.balance_cents || 0),
    currency: wallet.currency || 'KES',
    createdAt: wallet.created_at,
    updatedAt: wallet.updated_at
  };
}

const Wallet = {
  async getOrCreate(userId) {
    const [existing] = await pool.query(
      'SELECT * FROM wallets WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (existing[0]) {
      return normalize(existing[0]);
    }

    await pool.query(
      `
      INSERT INTO wallets
      (
        user_id,
        balance_cents,
        currency
      )
      VALUES
      (?, 0, 'KES')
      ON DUPLICATE KEY UPDATE
      user_id = user_id
      `,
      [userId]
    );

    const [created] = await pool.query(
      'SELECT * FROM wallets WHERE user_id = ? LIMIT 1',
      [userId]
    );

    return normalize(created[0]);
  },

  /**
   * Safely credit wallet
   */
  async credit(
    userId,
    amountCents,
    connection = null
  ) {
    const conn =
      connection ||
      await pool.getConnection();

    const ownsConnection =
      !connection;

    try {

      if (ownsConnection) {
        await conn.beginTransaction();
      }

      await conn.query(
        `
        INSERT INTO wallets
        (
          user_id,
          balance_cents,
          currency
        )
        VALUES
        (?, ?, 'KES')
        ON DUPLICATE KEY UPDATE
        balance_cents =
          balance_cents + ?
        `,
        [
          userId,
          amountCents,
          amountCents
        ]
      );

      if (ownsConnection) {
        await conn.commit();
      }

      return true;

    } catch (err) {

      if (ownsConnection) {
        await conn.rollback();
      }

      throw err;

    } finally {

      if (ownsConnection) {
        conn.release();
      }
    }
  },

  /**
   * Debit wallet only if balance is sufficient
   */
  async debitIfSufficient(
    userId,
    amountCents
  ) {
    const conn =
      await pool.getConnection();

    try {

      await conn.beginTransaction();

      await conn.query(
        `
        INSERT INTO wallets
        (
          user_id,
          balance_cents,
          currency
        )
        VALUES
        (?, 0, 'KES')
        ON DUPLICATE KEY UPDATE
        user_id = user_id
        `,
        [userId]
      );

      const [rows] =
        await conn.query(
          `
          SELECT balance_cents
          FROM wallets
          WHERE user_id = ?
          FOR UPDATE
          `,
          [userId]
        );

      const balance =
        Number(
          rows[0]?.balance_cents || 0
        );

      if (
        balance < amountCents
      ) {
        await conn.rollback();
        return false;
      }

      await conn.query(
        `
        UPDATE wallets
        SET balance_cents =
          balance_cents - ?
        WHERE user_id = ?
        `,
        [
          amountCents,
          userId
        ]
      );

      await conn.commit();

      return true;

    } catch (err) {

      await conn.rollback();

      throw err;

    } finally {

      conn.release();
    }
  },

  /**
   * Refund is just a credit
   */
  async refund(
    userId,
    amountCents
  ) {
    return this.credit(
      userId,
      amountCents
    );
  },

  /**
   * Current balance helper
   */
  async getBalance(
    userId
  ) {
    const wallet =
      await this.getOrCreate(
        userId
      );

    return wallet.balanceCents;
  }
};

module.exports = Wallet;
