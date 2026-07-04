const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

router.get('/dashboard', requireAuth, async (req, res) => {
  const wallet = await Wallet.getOrCreate(req.user.id);
  const transactions = await Transaction.listForUser(req.user.id, 5);

  res.render('dashboard', {
    title: 'Home',
    wallet,
    transactions
  });
});

module.exports = router;
