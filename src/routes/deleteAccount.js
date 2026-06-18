const express = require('express');
const { transporter, SMTP_USER } = require('../utils/mailer');
const { query } = require('../db/pool');

const router = express.Router();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — Carded</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(135deg, #F3E8FF 0%, #EDE9FE 50%, #F8FAFC 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 4px 24px rgba(107, 33, 232, 0.10);
      max-width: 480px;
      width: 100%;
      padding: 36px 32px;
    }
    .logo { text-align: center; margin-bottom: 28px; }
    .logo h1 { color: #6B21E8; font-size: 28px; letter-spacing: -1px; }
    .logo p { color: #94A3B8; font-size: 13px; margin-top: 4px; }
    h2 { color: #0F172A; font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: #64748B; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    label { display: block; color: #334155; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    input[type="email"], textarea {
      width: 100%;
      border: 1.5px solid #E2E8F0;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 14px;
      color: #0F172A;
      outline: none;
      transition: border-color 0.2s;
      margin-bottom: 16px;
    }
    input[type="email"]:focus, textarea:focus { border-color: #6B21E8; }
    textarea { resize: vertical; min-height: 80px; }
    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 24px;
    }
    .checkbox-row input { margin-top: 3px; accent-color: #6B21E8; }
    .checkbox-row label { font-weight: 400; font-size: 13px; color: #64748B; margin: 0; }
    button {
      width: 100%;
      background: #6B21E8;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #5B1DB8; }
    .alert {
      border-radius: 12px;
      padding: 14px 16px;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .alert-success { background: #F0FDF4; color: #166534; border: 1px solid #BBF7D0; }
    .alert-error { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }
    .footer { text-align: center; color: #CBD5E1; font-size: 11px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>Carded</h1>
      <p>Digital Visiting Cards</p>
    </div>
    ${body}
    <p class="footer">© Carded App • Digital cards. Zero paper.</p>
  </div>
</body>
</html>`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendDeleteRequestEmail({ email, reason, userFound }) {
  if (!ADMIN_EMAIL) {
    throw new Error('ADMIN_EMAIL is not set in .env');
  }

  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const accountStatus = userFound === null ? 'Unknown (DB unavailable)' : (userFound ? 'Yes' : 'No');

  console.log('[DeleteAccount] Sending email...');
  console.log('[DeleteAccount]   from:', SMTP_USER);
  console.log('[DeleteAccount]   to:  ', ADMIN_EMAIL);
  console.log('[DeleteAccount]   user email:', email);
  console.log('[DeleteAccount]   account exists:', accountStatus);

  const info = await transporter.sendMail({
    from: `"Carded App" <${SMTP_USER}>`,
    to: ADMIN_EMAIL,
    subject: 'Account Deletion Request — Carded App',
    text: [
      'A user has requested account deletion.',
      '',
      `Email: ${email}`,
      `Account found in database: ${accountStatus}`,
      `Reason: ${reason || '(not provided)'}`,
      `Requested at: ${timestamp}`,
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#DC2626;margin-bottom:16px">Account Deletion Request</h2>
        <p style="color:#64748B;margin-bottom:20px">A user has submitted a request to delete their Carded account.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#94A3B8;width:140px">Email</td><td style="padding:8px 0;color:#0F172A;font-weight:600">${email}</td></tr>
          <tr><td style="padding:8px 0;color:#94A3B8">Account exists</td><td style="padding:8px 0;color:#0F172A">${accountStatus}</td></tr>
          <tr><td style="padding:8px 0;color:#94A3B8">Reason</td><td style="padding:8px 0;color:#0F172A">${reason || '(not provided)'}</td></tr>
          <tr><td style="padding:8px 0;color:#94A3B8">Requested at</td><td style="padding:8px 0;color:#0F172A">${timestamp}</td></tr>
        </table>
      </div>`,
  });

  console.log('[DeleteAccount] Email sent OK — messageId:', info.messageId);
  console.log('[DeleteAccount] SMTP response:', info.response);
  return info;
}

router.get('/delete-account', (_req, res) => {
  const body = `
    <h2>Delete Account</h2>
    <p class="subtitle">
      Submit a request to permanently delete your Carded account and all associated data.
      Our team will process your request within 7 business days.
    </p>
    <form method="POST" action="/delete-account">
      <label for="email">Account email address</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required/>

      <label for="reason">Reason (optional)</label>
      <textarea id="reason" name="reason" placeholder="Tell us why you're leaving..."></textarea>

      <div class="checkbox-row">
        <input type="checkbox" id="confirm" name="confirm" value="yes" required/>
        <label for="confirm">I understand that deleting my account is permanent and cannot be undone.</label>
      </div>

      <button type="submit">Submit Deletion Request</button>
    </form>`;

  res.type('html').send(pageShell('Delete Account', body));
});

router.post('/delete-account', async (req, res) => {
  const email  = (req.body.email || '').toLowerCase().trim();
  const reason = (req.body.reason || '').trim();
  const confirm = req.body.confirm;

  console.log('[DeleteAccount] ─── New request ───');
  console.log('[DeleteAccount] email:', email);
  console.log('[DeleteAccount] reason:', reason || '(empty)');
  console.log('[DeleteAccount] confirm:', confirm);

  if (!email || !isValidEmail(email)) {
    console.log('[DeleteAccount] REJECTED — invalid email');
    const body = `
      <div class="alert alert-error">Please enter a valid email address.</div>
      <a href="/delete-account" style="color:#6B21E8;font-size:14px">← Go back</a>`;
    return res.status(400).type('html').send(pageShell('Delete Account', body));
  }

  if (confirm !== 'yes') {
    console.log('[DeleteAccount] REJECTED — checkbox not confirmed');
    const body = `
      <div class="alert alert-error">Please confirm that you understand account deletion is permanent.</div>
      <a href="/delete-account" style="color:#6B21E8;font-size:14px">← Go back</a>`;
    return res.status(400).type('html').send(pageShell('Delete Account', body));
  }

  console.log('[DeleteAccount] Validation passed, checking DB...');
  let userFound = null;
  try {
    const result = await query('SELECT id, full_name FROM users WHERE email = $1 LIMIT 1', [email]);
    userFound = result.rowCount > 0;
    console.log('[DeleteAccount] DB lookup OK — account found:', userFound);
    if (userFound) console.log('[DeleteAccount]   user:', result.rows[0].full_name);
  } catch (dbErr) {
    console.error('[DeleteAccount] DB lookup FAILED:', dbErr.message);
    console.log('[DeleteAccount] Continuing without DB — will still send email');
  }

  try {
    await sendDeleteRequestEmail({ email, reason, userFound });

    console.log('[DeleteAccount] SUCCESS — request completed for', email);

    const body = `
      <div class="alert alert-success">
        Your account deletion request has been submitted successfully.
        We will process it within 7 business days and notify you at <strong>${email}</strong>.
      </div>
      <p class="subtitle" style="margin-bottom:0">If this was a mistake, please contact us immediately.</p>`;

    return res.type('html').send(pageShell('Request Submitted', body));
  } catch (err) {
    console.error('[DeleteAccount] EMAIL FAILED:', err.message);
    if (err.response) console.error('[DeleteAccount] SMTP error response:', err.response);
    if (err.code) console.error('[DeleteAccount] Error code:', err.code);
    const body = `
      <div class="alert alert-error">Something went wrong. Please try again later.</div>
      <a href="/delete-account" style="color:#6B21E8;font-size:14px">← Go back</a>`;
    return res.status(500).type('html').send(pageShell('Delete Account', body));
  }
});

module.exports = router;
