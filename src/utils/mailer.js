const nodemailer = require('nodemailer');
require('dotenv').config();

const SMTP_HOST   = 'smtp.gmail.com';
const SMTP_PORT   = 465;
const SMTP_SECURE = true;
const SMTP_USER   = process.env.SMTP_USER;
const SMTP_PASS   = process.env.SMTP_PASS;
const ADMIN_EMAIL = 'aithozpm@gmail.com';

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('[Mailer] SMTP_USER or SMTP_PASS missing in .env — emails will fail');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

console.log('[Mailer] SMTP ready — user:', SMTP_USER || '(not set)', `| host: ${SMTP_HOST}:${SMTP_PORT}`);

module.exports = { transporter, SMTP_USER, ADMIN_EMAIL };
