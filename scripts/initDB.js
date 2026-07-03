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

(async () => {
  try {
    console.log('Connecting to database...');
    await pool.query(createUsersTable);
    await ensureUsernameColumn();
    console.log('✔ users table is ready.');
    process.exit(0);
  } catch (err) {
    console.error('✘ Failed to initialize database:', err.message);
    process.exit(1);
  }
})();
