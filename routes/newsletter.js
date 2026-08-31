const express = require('express');
const router = express.Router();
const Newsletter = require('../models/Newsletter');
const { sendEmail } = require('../config/email');

// @route   POST /api/newsletter
// @desc    Subscribe to restaurant newsletter
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, msg: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, msg: 'Please enter a valid email address.' });
    }

    let existing = await Newsletter.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(200).json({
        success: true,
        msg: 'You are already subscribed to the VELORA VIP Club!',
        sub: existing,
      });
    }

    const sub = new Newsletter({
      email: cleanEmail,
      name: name ? name.trim() : '',
      subscribedAt: new Date(),
    });
    await sub.save();

    // Broadcast websocket notification to admin
    try {
      const wsHelpers = req.app.get('wsHelpers');
      if (wsHelpers) {
        wsHelpers.emitGlobally('newsletter_subscribed', sub);
      }
    } catch (wsErr) {
      console.error('WebSocket broadcast error for newsletter:', wsErr);
    }

    // Send Welcome VIP Email
    try {
      const recipientName = name && name.trim() ? name.trim() : 'Valued Patron';
      await sendEmail({
        to: cleanEmail,
        subject: '✨ Welcome to the VELORA VIP Dining Club [10% Gift Inside]',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #0a0a0a; border-radius: 20px; overflow: hidden; border: 1px solid #333; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="background: linear-gradient(135deg, #1c1917, #0a0a0a); padding: 32px 24px; text-align: center; border-bottom: 1px solid #262626;">
              <h1 style="color: #f59e0b; font-family: Georgia, serif; margin: 0; font-size: 28px; letter-spacing: 4px;">VELORA</h1>
              <p style="color: #a3a3a3; margin: 6px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 3px;">Haute Gastronomy &amp; Fine Cellars</p>
            </div>

            <div style="padding: 32px 24px; text-align: center;">
              <p style="color: #e5e5e5; font-size: 16px; margin: 0 0 16px;">Dear <strong>${recipientName}</strong>,</p>
              
              <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                Welcome to our private inner circle. As a VIP member, you will receive priority reservations, private chef's tasting invites, and access to vintage cellar releases.
              </p>

              <!-- VIP Privilege Gift Box -->
              <div style="background: rgba(245, 158, 11, 0.1); border: 2px dashed #f59e0b; border-radius: 16px; padding: 20px 24px; margin: 0 auto 28px; max-width: 380px;">
                <p style="color: #a3a3a3; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 6px;">Your VIP Welcome Voucher</p>
                <p style="color: #f59e0b; font-family: monospace; font-size: 24px; font-weight: bold; margin: 0 0 6px; letter-spacing: 4px;">VIPGUEST</p>
                <p style="color: #d4d4d4; font-size: 12px; margin: 0;">Enjoy <strong>20% Off</strong> your next fine dining reservation.</p>
              </div>

              <div style="margin: 28px 0;">
                <a href="${process.env.BASE_URL || 'http://localhost:3000'}/reserve" style="display: inline-block; background: #f59e0b; color: #000; text-decoration: none; padding: 14px 36px; border-radius: 999px; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
                  Reserve a VIP Table
                </a>
              </div>

              <p style="color: #737373; font-size: 12px; margin: 24px 0 0;">
                We look forward to curating an unforgettable culinary experience for you.
              </p>
            </div>

            <div style="background: #171717; padding: 16px; text-align: center; border-top: 1px solid #262626;">
              <p style="color: #737373; font-size: 11px; margin: 0;">© VELORA Fine Dining · Haute Gastronomy</p>
            </div>
          </div>
        `,
        text: `Hello ${recipientName},\n\nWelcome to the VELORA VIP Club! Use voucher code VIPGUEST for 20% off your next dining reservation.\n\nReserve now: ${process.env.BASE_URL || 'http://localhost:3000'}/reserve\n\n— VELORA`,
      });
    } catch (emailErr) {
      console.error('Error sending welcome email to newsletter subscriber:', emailErr);
    }

    res.status(201).json({
      success: true,
      msg: '✨ Subscribed successfully! Check your inbox for your digital VIP 20% dining pass.',
      sub,
    });
  } catch (err) {
    console.error('Newsletter subscription error:', err);
    res.status(500).json({ success: false, msg: 'Server error subscribing to newsletter.' });
  }
});

// @route   GET /api/newsletter/count
// @desc    Get total subscribers count
// @access  Public
router.get('/count', async (req, res) => {
  try {
    const count = await Newsletter.countDocuments();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
