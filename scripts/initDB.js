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

(async () => {
  try {
    console.log('Connecting to database...');
    await pool.query(createUsersTable);
    console.log('✔ users table is ready.');
    process.exit(0);
  } catch (err) {
    console.error('✘ Failed to initialize database:', err.message);
    process.exit(1);
  }
})();
