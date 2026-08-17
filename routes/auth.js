const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const ActivityLog = require('../models/ActivityLog');

// Build verification email link
function buildVerifyUrl(token) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/verify-email/${token}`;
}

// Send verification email to a user
async function sendVerificationEmail(user) {
  const verifyUrl = buildVerifyUrl(user.verificationToken);
  await sendEmail({
    to: user.email,
    subject: 'Confirm your email — L\'Étoile Dorée',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #eee;">
        <div style="background: #0a0a0a; padding: 28px; text-align: center;">
          <h1 style="color: #f59e0b; font-family: Georgia, serif; margin: 0; letter-spacing: 2px;">VELORA</h1>
          <p style="color: #aaa; margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px;">Email Confirmation</p>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #111; font-size: 20px; margin: 0 0 8px;">Hello ${user.name},</h2>
          <p style="color: #444; line-height: 1.6; margin: 0 0 16px;">
            Thanks for creating an account at VELORA. Please confirm your email address by clicking the button below to activate your account.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${verifyUrl}" style="display: inline-block; background: #f59e0b; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: bold; font-size: 14px;">
              Confirm Email
            </a>
          </div>
          <p style="color: #444; line-height: 1.6; margin: 0 0 16px; word-break: break-all;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #888; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 12px; border-radius: 8px;">
            ${verifyUrl}
          </p>
          <p style="color: #999; font-size: 12px; line-height: 1.6; margin-top: 24px;">
            If you did not create this account, you can safely ignore this email.
          </p>
        </div>
      </div>
    `,
    text: `
      Hello ${user.name},

      Thanks for creating an account at VELORA. Please confirm your email address by visiting the link below to activate your account:

      ${verifyUrl}

      If you did not create this account, you can safely ignore this email.

      — VELORA
    `,
  });
}

// Reusable branded email wrapper
function brandedEmail(title, bodyHtml) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee;">
    <div style="background:#0a0a0a;padding:28px;text-align:center;">
      <h1 style="color:#f59e0b;font-family:Georgia,serif;margin:0;letter-spacing:2px;">VELORA</h1>
      <p style="color:#aaa;margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:3px;">${title}</p>
    </div>
    <div style="padding:32px;">${bodyHtml}</div>
    <div style="background:#f9f9f9;padding:16px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#aaa;font-size:11px;margin:0;">© VELORA · Fine Dining</p>
    </div>
  </div>`;
}

// SIGNUP
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Auto-assign admin role if email matches configured admin email
    const adminEmailConfig = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
    const adminEmails = adminEmailConfig
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isAdmin = adminEmails.includes(email.toLowerCase());

    const verificationToken = crypto.randomBytes(32).toString('hex');

    user = new User({
      name,
      email,
      password: hashedPassword,
      role: isAdmin ? 'admin' : 'customer',
      verificationToken,
    });
    await user.save();

    // Log signup activity
    await ActivityLog.create({ user: user._id, name: user.name, email: user.email, role: user.role, action: 'signup', ip: req.ip, userAgent: req.headers['user-agent'] });

    // Send verification email (falls back to console log in dev)
    try {
      await sendVerificationEmail(user);
    } catch (emailErr) {
      console.error('Error sending verification email:', emailErr);
    }

    // Send welcome email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Welcome to L\'Étoile Dorée',
        html: brandedEmail('Welcome', `
          <h2 style="color:#111;margin:0 0 12px;">Welcome, ${user.name}!</h2>
          <p style="color:#444;line-height:1.6;margin:0 0 16px;">
            Your account has been created successfully. We are honored to welcome you to VELORA.
          </p>
        `),
        text: `Welcome, ${user.name}!\n\nYour account has been created successfully at VELORA. Please check your inbox for a separate email to verify your address.\n\n— VELORA`,
      });
    } catch (emailErr) {
      console.error('Error sending welcome email:', emailErr);
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const refreshToken = jwt.sign({ id: user._id }, refreshSecret, { expiresIn: '7d' });
    res.json({
      token,
      refreshToken,
      user: { _id: user._id, name, email, role: user.role, isVerified: user.isVerified },
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

    // Auto-promote configured admin emails if not already admin
    const adminEmailConfig = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
    const adminEmails = adminEmailConfig
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.includes(user.email.toLowerCase()) && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const refreshToken = jwt.sign({ id: user._id }, refreshSecret, { expiresIn: '7d' });

    // Log login activity
    await ActivityLog.create({ user: user._id, name: user.name, email: user.email, role: user.role, action: 'login', ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({
      token,
      refreshToken,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified },
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// REFRESH TOKEN
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ msg: 'Refresh token required' });
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(refreshToken, refreshSecret);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ msg: 'User not found' });
    }

    const newToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const newRefreshToken = jwt.sign({ id: user._id }, refreshSecret, { expiresIn: '7d' });

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified },
    });
  } catch (err) {
    res.status(401).json({ msg: 'Invalid or expired refresh token' });
  }
});

// LOGOUT — log the activity
router.post('/logout', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      await ActivityLog.create({ user: user._id, name: user.name, email: user.email, role: user.role, action: 'logout', ip: req.ip, userAgent: req.headers['user-agent'] });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// VERIFY EMAIL — confirm user account by token
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid or expired verification link.' });
    }

    if (user.isVerified) {
      return res.json({ msg: 'This email has already been verified.', user: { _id: user._id, name: user.name, email: user.email, role: user.role, isVerified: true } });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    // Send email verified confirmation
    try {
      await sendEmail({
        to: user.email,
        subject: `Email Verified — VELORA`,
        html: brandedEmail('Email Verified', `
          <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Your email is verified ✅</h2>
          <p style="color:#444;line-height:1.7;margin:0 0 16px;">Hello ${user.name}, your email address has been successfully verified.</p>
          <p style="color:#444;line-height:1.7;">You now have full access to your account. We look forward to welcoming you at VELORA.</p>
        `),
        text: `Hello ${user.name},\n\nYour email has been successfully verified. You now have full access to your account.\n\n— VELORA`,
      });
    } catch (emailErr) {
      console.error('Error sending verified confirmation email:', emailErr);
    }

    res.json({ msg: 'Email verified successfully!', user: { _id: user._id, name: user.name, email: user.email, role: user.role, isVerified: true } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// RESEND VERIFICATION EMAIL (auth required)
router.post('/resend', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (user.isVerified) {
      return res.status(400).json({ msg: 'Email is already verified.' });
    }

    // Regenerate token for a fresh link
    user.verificationToken = crypto.randomBytes(32).toString('hex');
    await user.save();

    try {
      await sendVerificationEmail(user);
    } catch (emailErr) {
      console.error('Error sending verification email:', emailErr);
    }

    res.json({ msg: 'Verification email sent. Please check your inbox.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /me — Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /me — Update user profile
router.put('/me', auth, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();
    res.json({ msg: 'Profile updated', user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /me/reservations — Get user's reservations
router.get('/me/reservations', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const reservations = await Reservation.find({ email: user.email }).sort({ date: -1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
