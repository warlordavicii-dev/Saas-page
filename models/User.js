const pool = require('../config/db');

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;

const User = {
  USERNAME_PATTERN,

  async create({ name, username, email, password, verifyToken, verifyTokenExpires }) {
    const [result] = await pool.query(
      `INSERT INTO users (name, username, email, password, verify_token, verify_token_expires)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, username, email, password, verifyToken, verifyTokenExpires]
    );
    return result.insertId;
  },

  async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
    return rows[0] || null;
  },

  // Case-insensitive availability check, optionally excluding the
  // current user's own id (for the settings/profile page).
  async isUsernameTaken(username, excludeUserId = null) {
    const params = [username];
    let sql = 'SELECT id FROM users WHERE LOWER(username) = LOWER(?)';
    if (excludeUserId) {
      sql += ' AND id != ?';
      params.push(excludeUserId);
    }
    sql += ' LIMIT 1';
    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  },

  async findByVerifyToken(token) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE verify_token = ? AND verify_token_expires > NOW() LIMIT 1',
      [token]
    );
    return rows[0] || null;
  },

  // verify_token doubles as the 6-digit verification code. Looking it up
  // scoped to an email (rather than the code alone) avoids collisions,
  // since a 6-digit code has far fewer possible values than a random token.
  async findByEmailAndVerifyCode(email, code) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND verify_token = ? AND verify_token_expires > NOW() LIMIT 1',
      [email, code]
    );
    return rows[0] || null;
  },

  async findByResetToken(token) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW() LIMIT 1',
      [token]
    );
    return rows[0] || null;
  },

  async markVerified(id) {
    await pool.query(
      'UPDATE users SET is_verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?',
      [id]
    );
  },

  async setVerifyToken(id, token, expires) {
    await pool.query(
      'UPDATE users SET verify_token = ?, verify_token_expires = ? WHERE id = ?',
      [token, expires, id]
    );
  },

  async setResetToken(id, token, expires) {
    await pool.query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [token, expires, id]
    );
  },

  async updatePassword(id, hashedPassword) {
    await pool.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [hashedPassword, id]
    );
  },

  async updateProfile(id, { name, username, email }) {
    await pool.query('UPDATE users SET name = ?, username = ?, email = ? WHERE id = ?', [name, username, email, id]);
  }
};

module.exports = User;
