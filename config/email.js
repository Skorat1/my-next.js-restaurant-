const nodemailer = require('nodemailer');

// Check if email credentials are configured
const isConfigured = Boolean(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);

// Create transporter (only if credentials are present)
const transporter = isConfigured
  ? nodemailer.createTransport({
      pool: true, // Use a connection pool for better performance
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      // `secure` is true if port is 465. For other ports (like 587), `secure: false` will use STARTTLS.
      // You can override this with a `EMAIL_SECURE` env var.
      secure: process.env.EMAIL_SECURE ? ['true', '1', 'yes'].includes(process.env.EMAIL_SECURE) : (Number(process.env.EMAIL_PORT) === 465),
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  : null;
  
// Verify SMTP connection on startup
if (transporter) {
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ SMTP connection error:', error);
    } else {
      console.log('✅ SMTP connection is ready to send emails.');
    }
  });
}
  
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@restaurant.com';

/**
 * Send an email.
 * If SMTP is not configured, logs the email to the console instead (dev mode).
 * @param {Object} opts - { to, subject, html, text }
 */
async function sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    console.log('⚠️  [Email not sent — SMTP not configured]');
    console.log(`📨 To: ${to}`);
    console.log(`📌 Subject: ${subject}`);
    console.log(`📄 Body: ${text || html}`);
    return { devMode: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"L'Étoile Dorée" <${EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
    });
  
    console.log('✅ Email sent:', info.messageId);
    return { devMode: false, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    // Re-throw or handle the error as appropriate for your application
    throw new Error('Failed to send email.');
  }
}

module.exports = { sendEmail, isConfigured };
