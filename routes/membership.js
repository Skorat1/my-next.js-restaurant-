const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Razorpay loaded lazily so server boots without SDK/keys (simulated fallback)
let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch {
  Razorpay = null;
}

const isRazorpayConfigured = () =>
  Razorpay &&
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET;

// Membership tiers & pricing
const TIERS = {
  gold: { id: 'gold', name: 'Gold', price: 499, durationDays: 365 },
  platinum: { id: 'platinum', name: 'Platinum', price: 999, durationDays: 365 },
};

// GET /api/membership/summary — current user's membership status (auth)
router.get('/summary', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('name email membership');
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const m = user.membership || {};
    const active = m.active && m.expiresAt && new Date(m.expiresAt) > new Date();
    const daysLeft = m.expiresAt && new Date(m.expiresAt) > new Date()
      ? Math.ceil((new Date(m.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      tier: m.tier || null,
      active: !!active,
      startedAt: m.startedAt || null,
      expiresAt: m.expiresAt || null,
      daysLeft,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/membership/purchase — create payment intent for a tier (auth)
router.post('/purchase', auth, async (req, res) => {
  try {
    const { tier } = req.body;
    const plan = TIERS[tier];
    if (!plan) return res.status(400).json({ msg: 'Invalid membership tier.' });

    const receipt = `mem_${req.user._id}_${Date.now()}`;

    // Fallback: no Razorpay keys → simulate success
    if (!isRazorpayConfigured()) {
      const user = await User.findById(req.user._id);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
      user.membership = {
        tier: plan.id,
        active: true,
        startedAt: now,
        expiresAt,
        razorpayPaymentId: `sim-${Date.now()}`,
      };
      await user.save();
      
      // Send email
      try {
        const { sendEmail } = require('../config/email');
        await sendEmail({
          to: user.email,
          subject: `Membership Upgrade Successful - ${plan.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee;">
              <div style="background:#0a0a0a;padding:28px;text-align:center;">
                <h1 style="color:#f59e0b;font-family:Georgia,serif;margin:0;letter-spacing:2px;">VELORA</h1>
                <p style="color:#aaa;margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:3px;">Membership Upgrade</p>
              </div>
              <div style="padding:32px;">
                <h2 style="color:#111;margin:0 0 12px;">Hello ${user.name},</h2>
                <p style="color:#444;line-height:1.6;margin:0 0 16px;">
                  Congratulations! Your account has been successfully upgraded to the <strong>${plan.name}</strong> membership tier.
                </p>
                <p style="color:#444;line-height:1.6;margin:0 0 16px;">
                  <strong>Price Paid:</strong> ₹${plan.price}<br/>
                  <strong>Valid Until:</strong> ${expiresAt.toLocaleDateString()}
                </p>
              </div>
            </div>
          `,
          text: `Hello ${user.name},\n\nCongratulations! Your account has been successfully upgraded to the ${plan.name} membership tier, valid until ${expiresAt.toLocaleDateString()}.\n\n— VELORA`
        });
      } catch (err) {
        console.error('Failed to send membership email:', err);
      }

      return res.json({
        simulated: true,
        tier: plan.id,
        name: plan.name,
        price: plan.price,
        expiresAt,
        msg: 'Membership activated (simulated payment).',
      });
    }

    // Real Razorpay order creation (amount in paise, INR)
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const rzpOrder = await rzp.orders.create({
      amount: Math.round(plan.price * 100),
      currency: 'INR',
      receipt,
      notes: { membership: plan.id, user: String(req.user._id) },
    });

    // Store the pending razorpay order id on the user
    await User.findByIdAndUpdate(req.user._id, {
      'membership.razorpayOrderId': rzpOrder.id,
      'membership.tier': plan.id,
    });

    res.json({
      simulated: false,
      key: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      tier: plan.id,
      name: plan.name,
      price: plan.price,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error creating membership payment.' });
  }
});

// POST /api/membership/verify — verify Razorpay signature & activate membership
router.post('/verify', auth, async (req, res) => {
  try {
    const { tier, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const plan = TIERS[tier];
    if (!plan) return res.status(400).json({ msg: 'Invalid membership tier.' });
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ msg: 'Missing payment verification data.' });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ msg: 'Payment verification failed. Signature mismatch.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    user.membership = {
      tier: plan.id,
      active: true,
      startedAt: now,
      expiresAt,
      razorpayOrderId,
      razorpayPaymentId: razorpay_payment_id,
    };
    await user.save();

    // Send email
    try {
      const { sendEmail } = require('../config/email');
      await sendEmail({
        to: user.email,
        subject: `Membership Upgrade Successful - ${plan.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee;">
            <div style="background:#0a0a0a;padding:28px;text-align:center;">
              <h1 style="color:#f59e0b;font-family:Georgia,serif;margin:0;letter-spacing:2px;">VELORA</h1>
              <p style="color:#aaa;margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:3px;">Membership Upgrade</p>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#111;margin:0 0 12px;">Hello ${user.name},</h2>
              <p style="color:#444;line-height:1.6;margin:0 0 16px;">
                Congratulations! Your account has been successfully upgraded to the <strong>${plan.name}</strong> membership tier.
              </p>
              <p style="color:#444;line-height:1.6;margin:0 0 16px;">
                <strong>Price Paid:</strong> ₹${plan.price}<br/>
                <strong>Valid Until:</strong> ${expiresAt.toLocaleDateString()}
              </p>
            </div>
          </div>
        `,
        text: `Hello ${user.name},\n\nCongratulations! Your account has been successfully upgraded to the ${plan.name} membership tier, valid until ${expiresAt.toLocaleDateString()}.\n\n— VELORA`
      });
    } catch (err) {
      console.error('Failed to send membership email:', err);
    }

    res.json({ success: true, msg: 'Membership activated!', tier: plan.id, expiresAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error verifying membership payment.' });
  }
});

module.exports = router;
