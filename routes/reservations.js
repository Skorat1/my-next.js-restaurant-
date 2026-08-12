const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Reservation = require('../models/Reservation');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { sendEmail } = require('../config/email');

// Reusable branded email wrapper
function brandedEmail(title, bodyHtml) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee;">
    <div style="background:#0a0a0a;padding:28px;text-align:center;">
      <h1 style="color:#f59e0b;font-family:Georgia,serif;margin:0;letter-spacing:2px;">L'ÉTOILE DORÉE</h1>
      <p style="color:#aaa;margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:3px;">${title}</p>
    </div>
    <div style="padding:32px;">${bodyHtml}</div>
    <div style="background:#f9f9f9;padding:16px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#aaa;font-size:11px;margin:0;">© L'Étoile Dorée · Fine Dining</p>
    </div>
  </div>`;
}

router.post('/', async (req, res) => {
  try {
    const {
      name, email, phone, date, guests, notes,
      occasion, tableId, dietary, preOrders,
      promoCode, discountAmount, totalAmount, specialRequests, isWaitlist
    } = req.body;

    // Robustly parse date string (handles 12-hour formats like "2026-08-07T7:00 PM")
    let parsedDate;
    if (date) {
      const match = String(date).match(/^(\d{4}-\d{2}-\d{2})[T\s](\d+):(\d+)\s*(AM|PM)?/i);
      if (match) {
        let h = parseInt(match[2], 10);
        const m = parseInt(match[3], 10);
        const period = match[4] ? match[4].toUpperCase() : null;
        if (period === 'PM' && h < 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        parsedDate = new Date(`${match[1]}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
      } else {
        parsedDate = new Date(date);
      }
    }
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      parsedDate = new Date();
    }

    // Generate a verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const reservation = new Reservation({
      name,
      email,
      phone,
      date: parsedDate,
      guests: parseInt(guests, 10) || 2,
      notes,
      occasion: occasion || 'General',
      tableId: tableId || 'T1',
      tableNo: tableId || 'T1',
      dietary: Array.isArray(dietary) ? dietary : [],
      preOrders: Array.isArray(preOrders) ? preOrders : [],
      promoCode,
      discountAmount: Number(discountAmount) || 0,
      totalAmount: Number(totalAmount) || 0,
      specialRequests,
      status: isWaitlist ? 'Waitlisted' : 'Pending',
      verificationToken,
    });
    await reservation.save();

    // Build verification link
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify/${verificationToken}`;

    // Send verification email (falls back to console log in dev)
    try {
      await sendEmail({
        to: email,
        subject: 'Confirm your reservation — L\'Étoile Dorée',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #eee;">
            <div style="background: #0a0a0a; padding: 28px; text-align: center;">
              <h1 style="color: #f59e0b; font-family: Georgia, serif; margin: 0; letter-spacing: 2px;">L'ÉTOILE DORÉE</h1>
              <p style="color: #aaa; margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px;">Reservation Confirmation</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #111; font-size: 20px; margin: 0 0 8px;">Hello ${name},</h2>
              <p style="color: #444; line-height: 1.6; margin: 0 0 16px;">
                We received your table reservation request. Please confirm your email address by clicking the button below to finalize your booking.
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${verifyUrl}" style="display: inline-block; background: #f59e0b; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: bold; font-size: 14px;">
                  Confirm Reservation
                </a>
              </div>
              <p style="color: #444; line-height: 1.6; margin: 0 0 16px; word-break: break-all;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: #888; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 12px; border-radius: 8px;">
                ${verifyUrl}
              </p>
              <p style="color: #999; font-size: 12px; line-height: 1.6; margin-top: 24px;">
                If you did not make this reservation, you can safely ignore this email.
              </p>
            </div>
          </div>
        `,
        text: `
          Hello ${name},

          We received your table reservation request. Please confirm your email address by visiting the link below to finalize your booking:

          ${verifyUrl}

          If you did not make this reservation, you can safely ignore this email.

          — L'Étoile Dorée
        `,
      });
    } catch (emailErr) {
      console.error('Error sending reservation verification email:', emailErr);
    }

    res.status(201).json({
      msg: 'Reservation received — please check your email to verify.',
      reservation,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Verify reservation by token
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const reservation = await Reservation.findOne({ verificationToken: token });

    if (!reservation) {
      return res.status(400).json({ msg: 'Invalid or expired verification link.' });
    }

    if (reservation.verified) {
      return res.json({ msg: 'This reservation has already been verified.', reservation });
    }

    reservation.verified = true;
    reservation.verificationToken = undefined;
    await reservation.save();

    res.json({ msg: 'Reservation verified successfully!', reservation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get all reservations (Admin)
router.get('/all', [auth, admin], async (req, res) => {
  try {
    const reservations = await Reservation.find().sort({ createdAt: -1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Update reservation status (Admin)
router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const { status, notes, tableNo, area } = req.body;
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ msg: 'Reservation not found' });
    if (status) reservation.status = status;
    if (notes !== undefined) reservation.notes = notes;
    if (tableNo !== undefined) reservation.tableNo = tableNo;
    if (area !== undefined) reservation.area = area;
    await reservation.save();

    // Email user on Confirmed or Declined
    if (status === 'Confirmed' || status === 'Declined') {
      const isConfirmed = status === 'Confirmed';
      const dateStr = new Date(reservation.date).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      try {
        await sendEmail({
          to: reservation.email,
          subject: `Reservation ${status} — L'Étoile Dorée`,
          html: brandedEmail(`Reservation ${status}`, `
            <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Hello ${reservation.name},</h2>
            <p style="color:#444;line-height:1.7;margin:0 0 16px;">
              ${isConfirmed
                ? `We are pleased to confirm your table reservation at L'Étoile Dorée.`
                : `We regret to inform you that your reservation request could not be accommodated at this time.`}
            </p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px 0;color:#888;font-size:13px;">Date &amp; Time</td><td style="padding:8px 0;color:#111;font-size:13px;font-weight:bold;">${dateStr}</td></tr>
              <tr><td style="padding:8px 0;color:#888;font-size:13px;">Guests</td><td style="padding:8px 0;color:#111;font-size:13px;font-weight:bold;">${reservation.guests}</td></tr>
              <tr><td style="padding:8px 0;color:#888;font-size:13px;">Status</td><td style="padding:8px 0;font-size:13px;font-weight:bold;color:${isConfirmed ? '#16a34a' : '#dc2626'}">${status}</td></tr>
              ${notes ? `<tr><td style="padding:8px 0;color:#888;font-size:13px;">Note</td><td style="padding:8px 0;color:#444;font-size:13px;">${notes}</td></tr>` : ''}
            </table>
            ${isConfirmed
              ? `<p style="color:#444;line-height:1.7;">We look forward to welcoming you. Please arrive a few minutes early. If you need to make any changes, feel free to contact us.</p>`
              : `<p style="color:#444;line-height:1.7;">We apologize for the inconvenience. Please try booking a different date or contact us directly for assistance.</p>`}
          `),
          text: `Hello ${reservation.name},\n\nYour reservation on ${dateStr} for ${reservation.guests} guest(s) has been ${status}.${notes ? '\n\nNote: ' + notes : ''}\n\n— L'Étoile Dorée`,
        });
      } catch (emailErr) {
        console.error('Error sending reservation status email:', emailErr);
      }
    }

    res.json({ success: true, reservation });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Delete reservation (Admin)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    await Reservation.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;

