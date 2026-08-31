const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const Reservation = require('../models/Reservation');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { sendEmail } = require('../config/email');

// Helper to generate base64 QR Code image
async function generateQRCodeDataUrl(data) {
  try {
    return await QRCode.toDataURL(JSON.stringify(data), {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 260,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
    return null;
  }
}

// Reusable reservation pass email template
function passEmailHtml({ name, passCode, qrDataUrl, dateStr, guests, status, tableInfo, verifyUrl }) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; border-radius: 20px; overflow: hidden; border: 1px solid #333; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="background: linear-gradient(135deg, #1c1917, #0a0a0a); padding: 32px 24px; text-align: center; border-bottom: 1px solid #262626;">
      <h1 style="color: #f59e0b; font-family: Georgia, serif; margin: 0; font-size: 28px; letter-spacing: 4px;">VELORA</h1>
      <p style="color: #a3a3a3; margin: 6px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 3px;">Official Dining Pass &amp; Entry QR</p>
    </div>

    <div style="padding: 32px 24px; text-align: center;">
      <p style="color: #e5e5e5; font-size: 15px; margin: 0 0 20px;">Dear <strong>${name}</strong>,</p>

      <!-- Pass Code Badge -->
      <div style="background: rgba(245, 158, 11, 0.1); border: 2px dashed #f59e0b; border-radius: 14px; padding: 16px 24px; display: inline-block; margin-bottom: 24px;">
        <p style="color: #a3a3a3; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 4px;">Reservation Pass Code</p>
        <p style="color: #f59e0b; font-family: monospace; font-size: 26px; font-weight: bold; margin: 0; letter-spacing: 4px;">${passCode}</p>
      </div>

      <!-- QR Code Display -->
      ${qrDataUrl ? `
      <div style="background: #ffffff; padding: 16px; border-radius: 18px; display: inline-block; margin-bottom: 24px; box-shadow: 0 4px 15px rgba(245,158,11,0.2);">
        <img src="${qrDataUrl}" alt="Reservation Entry QR Code" style="width: 180px; height: 180px; display: block;" />
        <p style="color: #666; font-size: 10px; margin: 8px 0 0; font-family: sans-serif; font-weight: bold;">Scan at Entrance</p>
      </div>
      ` : ''}

      <!-- Booking Details Table -->
      <div style="background: #171717; border-radius: 14px; padding: 20px; text-align: left; margin-bottom: 24px; border: 1px solid #262626;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #d4d4d4;">
          <tr style="border-bottom: 1px solid #262626;">
            <td style="padding: 10px 0; color: #888;">Date &amp; Time</td>
            <td style="padding: 10px 0; font-weight: bold; color: #fff; text-align: right;">${dateStr}</td>
          </tr>
          <tr style="border-bottom: 1px solid #262626;">
            <td style="padding: 10px 0; color: #888;">Party Size</td>
            <td style="padding: 10px 0; font-weight: bold; color: #fff; text-align: right;">${guests} Guest(s)</td>
          </tr>
          <tr style="border-bottom: 1px solid #262626;">
            <td style="padding: 10px 0; color: #888;">Table Assignment</td>
            <td style="padding: 10px 0; font-weight: bold; color: #f59e0b; text-align: right;">${tableInfo}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #888;">Pass Status</td>
            <td style="padding: 10px 0; font-weight: bold; color: ${status === 'Confirmed' ? '#10b981' : '#f59e0b'}; text-align: right;">${status}</td>
          </tr>
        </table>
      </div>

      ${verifyUrl ? `
      <div style="margin: 24px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background: #f59e0b; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
          Confirm Booking Pass
        </a>
      </div>
      ` : ''}

      <p style="color: #737373; font-size: 12px; line-height: 1.6; margin: 0;">
        Please present your Pass Code or QR Code upon arrival. We look forward to serving you.
      </p>
    </div>

    <div style="background: #171717; padding: 16px; text-align: center; border-top: 1px solid #262626;">
      <p style="color: #737373; font-size: 11px; margin: 0;">© VELORA Fine Dining · Haute Gastronomy</p>
    </div>
  </div>`;
}

// POST /api/reservations (Create new table reservation)
router.post('/', async (req, res) => {
  try {
    const {
      name, email, phone, date, guests, notes,
      occasion, tableId, dietary, preOrders,
      promoCode, discountAmount, totalAmount, specialRequests, isWaitlist
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        msg: 'Name, email, and phone number are required to make a reservation.',
      });
    }

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

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const passCode = `RES-${randomHex}`;

    const reservation = new Reservation({
      passCode,
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

    // Skip QR Code generation for now, it will be generated upon admin confirmation
    const qrDataUrl = null;

    // Build verification link
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify/${verificationToken}`;
    const dateStr = new Date(reservation.date).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Send email indicating pending status
    try {
      await sendEmail({
        to: email,
        subject: `Reservation Request Received — VELORA`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; border-radius: 20px; overflow: hidden; border: 1px solid #333; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="background: linear-gradient(135deg, #1c1917, #0a0a0a); padding: 32px 24px; text-align: center; border-bottom: 1px solid #262626;">
              <h1 style="color: #f59e0b; font-family: Georgia, serif; margin: 0; font-size: 28px; letter-spacing: 4px;">VELORA</h1>
              <p style="color: #a3a3a3; margin: 6px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 3px;">Reservation Request Pending</p>
            </div>
            <div style="padding: 32px 24px; text-align: center;">
              <p style="color: #e5e5e5; font-size: 15px; margin: 0 0 20px;">Dear <strong>${name}</strong>,</p>
              <p style="color: #d4d4d4; font-size: 14px; margin: 0 0 20px;">
                Your reservation request for <strong>${dateStr}</strong> for <strong>${reservation.guests} Guest(s)</strong> has been successfully received and is currently <strong>Pending Confirmation</strong>.
              </p>
              <p style="color: #a3a3a3; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
                Our team is reviewing your request. Once confirmed, you will receive another email containing your official Dining Pass and QR Code for entry.
              </p>
              <p style="color: #737373; font-size: 12px; margin: 0;">We appreciate your patience and look forward to serving you.</p>
            </div>
          </div>
        `,
        text: `Hello ${name},\n\nYour reservation request for ${dateStr} for ${reservation.guests} guests has been received and is pending confirmation.\nOnce confirmed by our team, you will receive your official Dining Pass with a QR Code.\n\n— VELORA`,
      });
    } catch (emailErr) {
      console.error('Error sending reservation email with QR code:', emailErr);
    }

    res.status(201).json({
      msg: 'Reservation created — Pending Confirmation!',
      passCode: reservation.passCode,
      reservation,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET /api/reservations/my
// @desc    Get customer's reservations
// @access  Public with email/phone or Private with JWT
router.get('/my', async (req, res) => {
  try {
    let email = req.query.email;
    let phone = req.query.phone;
    let search = req.query.search;

    const authHeader = req.header('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey123');
        if (decoded && decoded.email) {
          email = email || decoded.email;
        } else if (decoded && decoded.user && decoded.user.email) {
          email = email || decoded.user.email;
        }
      } catch (jwtErr) {
        // fallback to query parameters
      }
    }

    const conditions = [];
    if (email && email.trim()) {
      conditions.push({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    }
    if (phone && phone.trim()) {
      conditions.push({ phone: { $regex: new RegExp(phone.trim(), 'i') } });
    }
    if (search && search.trim()) {
      const s = search.trim();
      conditions.push(
        { email: { $regex: new RegExp(s, 'i') } },
        { phone: { $regex: new RegExp(s, 'i') } },
        { name: { $regex: new RegExp(s, 'i') } },
        { passCode: { $regex: new RegExp(s, 'i') } }
      );
    }

    if (conditions.length === 0) {
      return res.status(400).json({ success: false, msg: 'Email, phone, or search query is required.' });
    }

    const reservations = await Reservation.find({ $or: conditions }).sort({ date: -1, createdAt: -1 });

    return res.json({ success: true, data: reservations });
  } catch (err) {
    console.error('Error fetching customer reservations:', err);
    return res.status(500).json({ success: false, msg: 'Server error fetching reservations' });
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
      return res.json({ msg: 'This reservation pass has already been verified.', reservation });
    }

    reservation.verified = true;
    reservation.verificationToken = undefined;
    if (reservation.status === 'Pending') {
      reservation.status = 'Confirmed';
    }
    await reservation.save();

    // Re-generate QR Code upon verification
    const qrDataUrl = await generateQRCodeDataUrl({
      passCode: reservation.passCode,
      reservationId: reservation._id,
      name: reservation.name,
      date: reservation.date,
      guests: reservation.guests,
      verified: true,
    });

    res.json({
      msg: 'Reservation pass verified successfully!',
      passCode: reservation.passCode,
      qrDataUrl,
      reservation,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get all reservations (Admin)
router.get('/all', [auth, admin], async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const reservations = await Reservation.find({ date: { $gte: todayStart } }).sort({ date: 1 });
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

    if (!reservation.passCode) {
      const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
      reservation.passCode = `RES-${randomHex}`;
    }

    await reservation.save();

    // Email user on status update with QR Pass
    if (status === 'Confirmed' || status === 'Declined') {
      const dateStr = new Date(reservation.date).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const qrDataUrl = await generateQRCodeDataUrl({
        passCode: reservation.passCode,
        reservationId: reservation._id,
        name: reservation.name,
        date: reservation.date,
        guests: reservation.guests,
        status,
      });

      // Send WhatsApp Notification
      if (status === 'Confirmed' && reservation.phone) {
        try {
          const { sendBookingConfirmation } = require('../services/whatsapp');
          await sendBookingConfirmation(
            reservation.phone, 
            reservation.name, 
            new Date(reservation.date).toLocaleDateString(), 
            new Date(reservation.date).toLocaleTimeString(), 
            reservation.guests
          );
        } catch (e) {
          console.error('Failed to send WhatsApp confirmation', e);
        }
      }

      try {
        await sendEmail({
          to: reservation.email,
          subject: `Reservation ${status} [Pass: ${reservation.passCode}] — VELORA`,
          html: passEmailHtml({
            name: reservation.name,
            passCode: reservation.passCode,
            qrDataUrl: status === 'Confirmed' ? qrDataUrl : null,
            dateStr,
            guests: reservation.guests,
            status,
            tableInfo: `${reservation.tableNo || 'T1'} (${reservation.area || 'Main Room'})`,
          }),
          text: `Hello ${reservation.name},\n\nYour reservation [${reservation.passCode}] on ${dateStr} has been ${status}.\n\n— VELORA`,
        });
      } catch (emailErr) {
        console.error('Error sending reservation status update email:', emailErr);
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


