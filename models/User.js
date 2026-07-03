const pool = require('../config/db');

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;

const User = {
  USERNAME_PATTERN,

  // -----------------------------------------------------
  // CREATE USER (with OTP fields)
  // -----------------------------------------------------
  async create({ name, username, email, password, verifyToken, verifyTokenExpires }) {
    const [result] = await pool.query(
      `INSERT INTO users 
      (name, username, email, password, verify_token, verify_token_expires, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [name, username, email, password, verifyToken, verifyTokenExpires]
    );

    return result.insertId;
  },

  // -----------------------------------------------------
  // BASIC LOOKUPS
  // -----------------------------------------------------
  async findByEmail(email) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  async findByUsername(username) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    return rows[0] || null;
  },

  // -----------------------------------------------------
  // USERNAME CHECK (safe + case insensitive)
  // -----------------------------------------------------
  async isUsernameTaken(username, excludeUserId = null) {
    let sql = 'SELECT id FROM users WHERE LOWER(username) = LOWER(?)';
    const params = [username];

    if (excludeUserId) {
      sql += ' AND id != ?';
      params.push(excludeUserId);
    }

    sql += ' LIMIT 1';

    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
  },

  // -----------------------------------------------------
  // OTP VERIFICATION FLOW (BREVO 6-DIGIT CODE)
  // -----------------------------------------------------

  async findByEmailAndVerifyCode(email, code) {
    const [rows] = await pool.query(
      `SELECT * FROM users 
       WHERE email = ? 
       AND verify_token = ? 
       LIMIT 1`,
      [email, code]
    );

    const user = rows[0];
    if (!user) return null;

    // Compare against this server's clock rather than the DB server's clock —
    // free/shared MySQL hosts often run clocks that drift or sit in a
    // different timezone, which was causing fresh codes to read as expired.
    if (!user.verify_token_expires || new Date(user.verify_token_expires).getTime() < Date.now()) {
      return null;
    }

    return user;
  },

  async setVerifyToken(id, token, expires) {
    await pool.query(
      `UPDATE users 
       SET verify_token = ?, verify_token_expires = ?
       WHERE id = ?`,
      [token, expires, id]
    );
  },

  async markVerified(id) {
    await pool.query(
      `UPDATE users 
       SET is_verified = 1,
           verify_token = NULL,
           verify_token_expires = NULL
       WHERE id = ?`,
      [id]
    );
  },

  // -----------------------------------------------------
  // PASSWORD RESET FLOW
  // -----------------------------------------------------

  async setResetToken(id, token, expires) {
    await pool.query(
      `UPDATE users 
       SET reset_token = ?, reset_token_expires = ?
       WHERE id = ?`,
      [token, expires, id]
    );
  },

  async findByResetToken(token) {
    const [rows] = await pool.query(
      `SELECT * FROM users 
       WHERE reset_token = ? 
       LIMIT 1`,
      [token]
    );

    const user = rows[0];
    if (!user) return null;

    if (!user.reset_token_expires || new Date(user.reset_token_expires).getTime() < Date.now()) {
      return null;
    }

    return user;
  },

  async updatePassword(id, hashedPassword) {
    await pool.query(
      `UPDATE users 
       SET password = ?,
           reset_token = NULL,
           reset_token_expires = NULL
       WHERE id = ?`,
      [hashedPassword, id]
    );
  },

  // -----------------------------------------------------
  // PROFILE UPDATE
  // -----------------------------------------------------

  async updateProfile(id, { name, username, email }) {
    await pool.query(
      `UPDATE users 
       SET name = ?, username = ?, email = ?
       WHERE id = ?`,
      [name, username, email, id]
    );
  }
};

module.exports = User;
