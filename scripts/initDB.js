/**
 * Creates the `users` table if it doesn't already exist.
 * Run automatically on deploy (see Procfile / render.yaml), or manually with:
 *   npm run initdb
 */
require('dotenv').config();
const pool = require('../config/db');

const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  verify_token VARCHAR(255) NULL,
  verify_token_expires DATETIME NULL,
  reset_token VARCHAR(255) NULL,
  reset_token_expires DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// Balances are stored as integer cents (KES * 100) to avoid floating-point
// rounding errors with real money.
const createWalletsTable = `
CREATE TABLE IF NOT EXISTS wallets (
  user_id INT PRIMARY KEY,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const createTransactionsTable = `
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('deposit', 'withdrawal') NOT NULL,
  channel ENUM('mpesa', 'airtel', 'bank', 'card') NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  status ENUM('pending', 'successful', 'failed') NOT NULL DEFAULT 'pending',
  tx_ref VARCHAR(64) NOT NULL UNIQUE,
  provider_transaction_id VARCHAR(64) NULL,
  destination VARCHAR(190) NULL,
  failure_reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_transactions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// utf8mb4 is required (not just plain utf8) so 4-byte characters like emoji
// can actually be stored without getting silently truncated or erroring out.
const createCommunityMessagesTable = `
CREATE TABLE IF NOT EXISTS community_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  username VARCHAR(32) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  reply_to_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_community_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_community_reply FOREIGN KEY (reply_to_id) REFERENCES community_messages(id) ON DELETE SET NULL,
  INDEX idx_community_created (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// Adds the username column for anyone who already has this table from
// before username support existed. Older MySQL builds (like many free
// hosts) don't support "ADD COLUMN IF NOT EXISTS", so we check first.
async function ensureUsernameColumn() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'`
  );
  if (rows[0].cnt > 0) return;

  console.log('Adding missing "username" column...');
  await pool.query('ALTER TABLE users ADD COLUMN username VARCHAR(32) NULL AFTER name');

  // Backfill existing rows with a placeholder so the UNIQUE index can be added.
  await pool.query(
    `UPDATE users SET username = CONCAT('user', id) WHERE username IS NULL`
  );

  await pool.query('ALTER TABLE users MODIFY username VARCHAR(32) NOT NULL');
  await pool.query('ALTER TABLE users ADD UNIQUE KEY uniq_username (username)');
}

// Anyone who deployed this app while it still used Flutterwave will have a
// `flw_transaction_id` column. We've moved to a provider-agnostic name since
// switching to IntaSend; rename it in place instead of losing the history.
async function ensureProviderTransactionIdColumn() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions'
       AND COLUMN_NAME IN ('provider_transaction_id', 'flw_transaction_id')`
  );
  const columns = rows.map((r) => r.COLUMN_NAME);
  if (columns.includes('provider_transaction_id')) return;

  if (columns.includes('flw_transaction_id')) {
    console.log('Renaming "flw_transaction_id" column to "provider_transaction_id"...');
    await pool.query('ALTER TABLE transactions CHANGE flw_transaction_id provider_transaction_id VARCHAR(64) NULL');
  } else {
    console.log('Adding missing "provider_transaction_id" column...');
    await pool.query('ALTER TABLE transactions ADD COLUMN provider_transaction_id VARCHAR(64) NULL AFTER tx_ref');
  }
}

(async () => {
  try {
    console.log('Connecting to database...');
    await pool.query(createUsersTable);
    await ensureUsernameColumn();
    await pool.query(createWalletsTable);
    await pool.query(createTransactionsTable);
    await ensureProviderTransactionIdColumn();
    await pool.query(createCommunityMessagesTable);
    console.log('✔ users, wallets, transactions, and community_messages tables are ready.');
    process.exit(0);
  } catch (err) {
    console.error('✘ Failed to initialize database:', err.message);
    process.exit(1);
  }
})();
