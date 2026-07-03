const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/mailer');

router.get('/settings', requireAuth, (req, res) => {
  res.render('settings', { title: 'Account settings' });
});

// ---------- UPDATE PROFILE (name / email) ----------
router.post(
  '/settings/profile',
  requireAuth,
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters.'),
    body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach((e) => req.flash('error', e.msg));
      return res.redirect('/settings');
    }

    const { name, email } = req.body;
    try {
      if (email !== req.user.email) {
        const existing = await User.findByEmail(email);
        if (existing) {
          req.flash('error', 'That email is already in use by another account.');
          return res.redirect('/settings');
        }

        // Changing email requires re-verification
        const verifyToken = crypto.randomBytes(32).toString('hex');
        const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await User.updateProfile(req.user.id, { name, email });
        await User.setVerifyToken(req.user.id, verifyToken, verifyTokenExpires);
        // mark unverified again
        const pool = require('../config/db');
        await pool.query('UPDATE users SET is_verified = 0 WHERE id = ?', [req.user.id]);

        const link = `${process.env.APP_URL}/verify-email/${verifyToken}`;
        await sendVerificationEmail(email, link);

        res.clearCookie('token');
        req.flash('success', 'Profile updated. Please verify your new email address, then log in again.');
        return res.redirect('/login');
      }

      await User.updateProfile(req.user.id, { name, email });
      req.flash('success', 'Profile updated successfully.');
      res.redirect('/settings');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Something went wrong updating your profile.');
      res.redirect('/settings');
    }
  }
);

// ---------- CHANGE PASSWORD ----------
router.post(
  '/settings/password',
  requireAuth,
  [
    body('currentPassword').notEmpty().withMessage('Enter your current password.'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
    body('confirmPassword').custom((value, { req }) => value === req.body.newPassword).withMessage('New passwords do not match.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach((e) => req.flash('error', e.msg));
      return res.redirect('/settings');
    }

    try {
      const match = await bcrypt.compare(req.body.currentPassword, req.user.password);
      if (!match) {
        req.flash('error', 'Current password is incorrect.');
        return res.redirect('/settings');
      }

      const hashed = await bcrypt.hash(req.body.newPassword, 12);
      await User.updatePassword(req.user.id, hashed);
      req.flash('success', 'Password changed successfully.');
      res.redirect('/settings');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Something went wrong changing your password.');
      res.redirect('/settings');
    }
  }
);

module.exports = router;
