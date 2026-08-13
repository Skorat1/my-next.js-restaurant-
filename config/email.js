const nodemailer = require('nodemailer');

// Check if email credentials are configured
const isConfigured = Boolean(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);

// Create transporter (only if credentials are present)
// Disabled pool: true to prevent persistent idle socket ECONNRESET errors on Windows/firewalls
const transporter = isConfigured
  ? nodemailer.createTransport({
    pool: false,
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE ? ['true', '1', 'yes'].includes(process.env.EMAIL_SECURE) : (Number(process.env.EMAIL_PORT) === 465),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: false,
    },
  })
  : null;

let isSmtpReady = false;

// Verify SMTP connection safely on startup without crashing or throwing
if (transporter) {
  transporter.verify((error, success) => {
    if (error) {
      isSmtpReady = false;
      console.warn(`⚠️  SMTP Connection Notice (${error.code || error.message}). Emails will fall back to console in development.`);
    } else {
      isSmtpReady = true;
      console.log('✅ SMTP connection is ready to send emails.');
    }
  });
}

const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@restaurant.com';

/**
 * Send an email.
 * If SMTP is not configured or network drops, logs the email to the console gracefully.
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
      from: `"VELORA" <${EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
    });

    console.log('✅ Email sent:', info.messageId);
    return { devMode: false, messageId: info.messageId };
  } catch (error) {
    console.warn(`⚠️  SMTP delivery notice (${error.code || error.message}). Falling back to console output:`);
    console.log(`📨 To: ${to}`);
    console.log(`📌 Subject: ${subject}`);
    console.log(`📄 Body:\n${text || html}`);
    return { devMode: true, error: error.message };
  }
}

module.exports = { sendEmail, isConfigured };

