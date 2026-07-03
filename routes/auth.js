const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const User = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts. Please try again in a few minutes.'
});

function issueToken(res, user) {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ---------- SIGNUP ----------
router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/settings');
  res.render('signup', { title: 'Create account' });
});

router.post(
  '/signup',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters.'),
    body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach((e) => req.flash('error', e.msg));
      return res.redirect('/signup');
    }

    const { name, email, password } = req.body;

    try {
      const existing = await User.findByEmail(email);
      if (existing) {
        req.flash('error', 'An account with that email already exists.');
        return res.redirect('/signup');
      }

      const hashed = await bcrypt.hash(password, 12);
      const verifyToken = makeToken();
      const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const id = await User.create({
        name,
        email,
        password: hashed,
        verifyToken,
        verifyTokenExpires
      });

      const link = `${process.env.APP_URL}/verify-email/${verifyToken}`;
      try {
        await sendVerificationEmail(email, link);
      } catch (mailErr) {
        console.error('Failed to send verification email:', mailErr.message);
        req.flash('error', 'Account created, but the verification email failed to send. Contact support or try resending it from the login page.');
        return res.redirect('/login');
      }

      req.flash('success', 'Account created! Check your email for a verification link before logging in.');
      res.redirect('/login');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Something went wrong creating your account. Please try again.');
      res.redirect('/signup');
    }
  }
);

// ---------- EMAIL VERIFICATION ----------
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findByVerifyToken(req.params.token);
    if (!user) {
      req.flash('error', 'That verification link is invalid or has expired.');
      return res.redirect('/login');
    }
    await User.markVerified(user.id);
    req.flash('success', 'Email verified! You can now log in.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong verifying your email.');
    res.redirect('/login');
  }
});

router.post('/resend-verification', authLimiter, [body('email').trim().isEmail().normalizeEmail()], async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findByEmail(email);
    // Always show the same message so we don't leak which emails are registered
    if (user && !user.is_verified) {
      const verifyToken = makeToken();
      const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await User.setVerifyToken(user.id, verifyToken, verifyTokenExpires);
      const link = `${process.env.APP_URL}/verify-email/${verifyToken}`;
      await sendVerificationEmail(email, link);
    }
    req.flash('success', 'If that account needs verifying, a new email is on its way.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not resend verification email right now.');
    res.redirect('/login');
  }
});

// ---------- LOGIN ----------
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/settings');
  res.render('login', { title: 'Log in' });
});

router.post(
  '/login',
  authLimiter,
  [body('email').trim().isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await User.findByEmail(email);
      if (!user) {
        req.flash('error', 'Incorrect email or password.');
        return res.redirect('/login');
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        req.flash('error', 'Incorrect email or password.');
        return res.redirect('/login');
      }

      if (!user.is_verified) {
        req.flash('error', 'Please verify your email before logging in. Check your inbox, or resend the link below.');
        return res.redirect('/login');
      }

      issueToken(res, user);
      res.redirect('/settings');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Something went wrong logging in. Please try again.');
      res.redirect('/login');
    }
  }
);

// ---------- LOGOUT ----------
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  req.flash('success', 'You have been logged out.');
  res.redirect('/login');
});

// ---------- FORGOT PASSWORD ----------
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'Forgot password' });
});

router.post('/forgot-password', authLimiter, [body('email').trim().isEmail().normalizeEmail()], async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findByEmail(email);
    if (user) {
      const resetToken = makeToken();
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
      await User.setResetToken(user.id, resetToken, resetTokenExpires);
      const link = `${process.env.APP_URL}/reset-password/${resetToken}`;
      await sendPasswordResetEmail(email, link);
    }
    // Same message whether or not the account exists, to avoid leaking user data
    req.flash('success', 'If that email is registered, a reset link is on its way.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/forgot-password');
  }
});

router.get('/reset-password/:token', async (req, res) => {
  const user = await User.findByResetToken(req.params.token);
  if (!user) {
    req.flash('error', 'That reset link is invalid or has expired.');
    return res.redirect('/forgot-password');
  }
  res.render('reset-password', { title: 'Reset password', token: req.params.token });
});

router.post(
  '/reset-password/:token',
  authLimiter,
  [
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach((e) => req.flash('error', e.msg));
      return res.redirect(`/reset-password/${req.params.token}`);
    }

    try {
      const user = await User.findByResetToken(req.params.token);
      if (!user) {
        req.flash('error', 'That reset link is invalid or has expired.');
        return res.redirect('/forgot-password');
      }

      const hashed = await bcrypt.hash(req.body.password, 12);
      await User.updatePassword(user.id, hashed);

      req.flash('success', 'Password updated! You can now log in.');
      res.redirect('/login');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Something went wrong resetting your password.');
      res.redirect('/forgot-password');
    }
  }
);

module.exports = router;
