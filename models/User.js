const pool = require('../config/db');

const User = {
  async create({ name, email, password, verifyToken, verifyTokenExpires }) {
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, verify_token, verify_token_expires)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, password, verifyToken, verifyTokenExpires]
    );
    return result.insertId;
  },

  async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    return rows[0] || null;
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

  async updateProfile(id, { name, email }) {
    await pool.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id]);
  }
};

module.exports = User;
