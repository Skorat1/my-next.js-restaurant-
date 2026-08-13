const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { sendEmail } = require('../config/email');

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

// 1. Submit a new table inquiry (Public)
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.referenceCode) {
      data.referenceCode = `INQ-${Math.floor(100000 + Math.random() * 900000)}`;
    }
    const newMessage = new Contact(data);
    await newMessage.save();
    res.json({
      success: true,
      msg: 'Inquiry received successfully!',
      referenceCode: newMessage.referenceCode,
      inquiry: newMessage
    });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 2. Fetch all table inquiries (Admin/Staff only)
router.get('/all', [auth, admin], async (req, res) => {
  try {
    const inquiries = await Contact.find().sort({ createdAt: -1 });
    res.json(inquiries);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 3. Update inquiry status or add staff notes (Admin/Staff only)
router.put('/:id', [auth, admin], async (req, res) => {
  const { status, notes } = req.body;
  try {
    const inquiry = await Contact.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ msg: 'Inquiry not found' });

    if (status) inquiry.status = status;
    if (notes !== undefined) inquiry.notes = notes;
    await inquiry.save();

    // Email user on Confirmed or Declined
    if (status === 'Confirmed' || status === 'Declined') {
      const isConfirmed = status === 'Confirmed';
      try {
        await sendEmail({
          to: inquiry.email,
          subject: `Your Inquiry has been ${status} — VELORA`,
          html: brandedEmail(`Inquiry ${status}`, `
            <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Hello ${inquiry.name},</h2>
            <p style="color:#444;line-height:1.7;margin:0 0 16px;">
              ${isConfirmed
              ? `We are pleased to confirm that your inquiry has been reviewed and accepted by our team.`
              : `Thank you for reaching out. After careful review, we are unable to accommodate your request at this time.`}
            </p>
            <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="color:#888;font-size:12px;margin:0 0 6px;">Your message:</p>
              <p style="color:#333;font-size:14px;margin:0;font-style:italic;">&ldquo;${inquiry.message}&rdquo;</p>
            </div>
            <p style="color:#444;line-height:1.7;">
              ${isConfirmed
              ? `A member of our team will be in touch shortly with further details. We look forward to welcoming you.`
              : `We apologize for any inconvenience. Please feel free to contact us again or try a different request.`}
            </p>
            ${notes ? `<p style="color:#666;font-size:13px;margin-top:12px;"><strong>Note from our team:</strong> ${notes}</p>` : ''}
          `),
          text: `Hello ${inquiry.name},\n\nYour inquiry has been ${status}.${notes ? '\n\nNote: ' + notes : ''}\n\n— VELORA`,
        });
      } catch (emailErr) {
        console.error('Error sending inquiry status email:', emailErr);
      }
    }

    res.json({ success: true, msg: 'Inquiry updated successfully', inquiry });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 4. Admin reply — saves reply & emails the user
router.post('/:id/reply', [auth, admin], async (req, res) => {
  const { reply } = req.body;
  if (!reply || !reply.trim()) return res.status(400).json({ msg: 'Reply cannot be empty.' });
  try {
    const inquiry = await Contact.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ msg: 'Inquiry not found' });

    inquiry.adminReply = reply.trim();
    inquiry.repliedAt = new Date();
    await inquiry.save();

    await sendEmail({
      to: inquiry.email,
      subject: `Re: Your Inquiry — VELORA`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:auto">
          <h2 style="color:#d97706">VELORA</h2>
          <p>Dear <strong>${inquiry.name}</strong>,</p>
          <p>Thank you for reaching out. Here is our response to your inquiry:</p>
          <blockquote style="border-left:3px solid #d97706;padding:12px 16px;background:#fafafa;color:#333">
            ${reply.trim().replace(/\n/g, '<br/>')}
          </blockquote>
          <hr style="margin:24px 0;border-color:#eee"/>
          <p style="color:#888;font-size:12px">Your original message:<br/><em>${inquiry.message}</em></p>
        </div>`,
      text: `Dear ${inquiry.name},\n\n${reply.trim()}\n\n---\nYour original message:\n${inquiry.message}`,
    });

    res.json({ success: true, inquiry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;