const express    = require('express');
const bcrypt     = require('bcryptjs');
const crypto     = require('crypto');
require('dotenv').config();
const { transporter, SMTP_USER } = require('../utils/mailer');
const { getGoogleAudiences, getGoogleClient } = require('../config/google');
const { query }  = require('../db/pool');
const { authMiddleware, signToken } = require('../middleware/auth');

const router = express.Router();

async function sendResetEmail(toEmail, resetCode) {
  await transporter.sendMail({
    from: `"Carded App" <${SMTP_USER}>`,
    to:   toEmail,
    subject: 'Your Carded Password Reset Code',
    text: `Your password reset code is: ${resetCode}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#fff">
        <div style="text-align:center;margin-bottom:28px">
          <h1 style="color:#6B21E8;font-size:28px;margin:0;letter-spacing:-1px">Carded</h1>
          <p style="color:#94A3B8;font-size:13px;margin:4px 0 0">Digital Visiting Cards</p>
        </div>
        <h2 style="color:#0F172A;font-size:20px;font-weight:700;margin-bottom:8px">Reset Your Password</h2>
        <p style="color:#64748B;font-size:14px;margin-bottom:24px;line-height:1.6">
          Use the code below to reset your Carded password. This code is valid for <strong>15 minutes</strong>.
        </p>
        <div style="background:#F3E8FF;border-radius:16px;padding:28px;text-align:center;margin-bottom:24px">
          <span style="font-size:42px;font-weight:900;letter-spacing:10px;color:#6B21E8;font-family:monospace">${resetCode}</span>
        </div>
        <p style="color:#94A3B8;font-size:12px;line-height:1.6">
          If you did not request a password reset, you can safely ignore this email.
          Your password will not be changed.
        </p>
        <hr style="border:none;border-top:1px solid #F1F5F9;margin:24px 0"/>
        <p style="color:#CBD5E1;font-size:11px;text-align:center">© Carded App • Digital cards. Zero paper.</p>
      </div>`,
  });
}

// ─── POST /auth/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;
    if (!fullName || !email || !phone || !password)
      return res.status(400).json({ success: false, message: 'All fields are required' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 LIMIT 1',
      [email.toLowerCase().trim(), phone.trim()]
    );
    if (existing.rowCount > 0)
      return res.status(409).json({ success: false, message: 'Email or phone already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (full_name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, phone`,
      [fullName.trim(), email.toLowerCase().trim(), phone.trim(), passwordHash]
    );
    const user  = result.rows[0];
    const token = signToken(user.id);
    return res.status(201).json({
      success: true, token,
      user: { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone },
    });
  } catch (err) {
    console.error('Register:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone || !password)
      return res.status(400).json({ success: false, message: 'Email/phone and password required' });

    const val    = emailOrPhone.toLowerCase().trim();
    const result = await query(
      'SELECT * FROM users WHERE email = $1 OR phone = $1 LIMIT 1', [val]);
    if (result.rowCount === 0)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user  = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = signToken(user.id);
    return res.json({
      success: true, token,
      user: { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone },
    });
  } catch (err) {
    console.error('Login:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, full_name, email, phone FROM users WHERE id = $1', [req.userId]);
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'User not found' });
    const u = result.rows[0];
    return res.json({
      success: true,
      user: { id: u.id, fullName: u.full_name, email: u.email, phone: u.phone },
    });
  } catch (err) {
    console.error('Get me:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── PUT /auth/password ───────────────────────────────────────
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'Both passwords required' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid)
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /auth/forgot-password ───────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, message: 'Email required' });

    const result = await query(
      'SELECT id, email FROM users WHERE email = $1 LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (result.rowCount === 0)
      return res.json({ success: true, message: 'If this email exists, a code has been sent.' });

    const user    = result.rows[0];
    const otp     = crypto.randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET token = $2, expires_at = $3, used = false`,
      [user.id, otp, expires]
    );

    await sendResetEmail(user.email, otp);

    return res.json({ success: true, message: 'Reset code sent to your email.' });
  } catch (err) {
    console.error('Forgot password:', err);
    return res.status(500).json({ success: false, message: 'Failed to send reset email' });
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ success: false, message: 'Email and OTP required' });

    const result = await query(
      `SELECT prt.token, prt.expires_at, prt.used, u.id as user_id
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE u.email = $1
       ORDER BY prt.expires_at DESC LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    if (result.rowCount === 0)
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });

    const row = result.rows[0];
    if (row.used)
      return res.status(400).json({ success: false, message: 'Code already used' });
    if (new Date() > new Date(row.expires_at))
      return res.status(400).json({ success: false, message: 'Code expired. Request a new one.' });
    if (row.token !== otp.trim())
      return res.status(400).json({ success: false, message: 'Incorrect code' });

    const resetToken  = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await query(
      `UPDATE password_reset_tokens
       SET reset_token = $1, reset_token_expires = $2
       WHERE user_id = $3`,
      [resetToken, resetExpiry, row.user_id]
    );

    return res.json({ success: true, resetToken });
  } catch (err) {
    console.error('Verify OTP:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /auth/reset-password ────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword)
      return res.status(400).json({ success: false, message: 'Reset token and new password required' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const result = await query(
      `SELECT user_id, reset_token_expires, used
       FROM password_reset_tokens WHERE reset_token = $1 LIMIT 1`,
      [resetToken]
    );

    if (result.rowCount === 0)
      return res.status(400).json({ success: false, message: 'Invalid reset token' });

    const row = result.rows[0];
    if (row.used)
      return res.status(400).json({ success: false, message: 'Token already used' });
    if (new Date() > new Date(row.reset_token_expires))
      return res.status(400).json({ success: false, message: 'Reset token expired' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, row.user_id]);
    await query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1', [row.user_id]);

    return res.json({ success: true, message: 'Password reset successfully. Please login.' });
  } catch (err) {
    console.error('Reset password:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /auth/google ─────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    let audiences;
    try {
      audiences = getGoogleAudiences();
    } catch (configErr) {
      console.error('Google auth config:', configErr.message);
      return res.status(503).json({
        success: false,
        message: 'Google Sign-In is not configured on the server',
      });
    }

    const { idToken, accessToken } = req.body;
    if (!idToken && !accessToken) {
      return res.status(400).json({ success: false, message: 'idToken or accessToken required' });
    }

    let googleId, email, name, picture;

    // Strategy 1: Verify Google ID token
    let idTokenVerified = false;
    if (idToken) {
      try {
        const ticket = await getGoogleClient().verifyIdToken({
          idToken,
          audience: audiences,
        });
        const payload = ticket.getPayload();
        ({ sub: googleId, email, name, picture } = payload);
        idTokenVerified = true;
      } catch (idErr) {
        console.warn('Google idToken verification failed:', idErr.message);
      }
    }

    // Strategy 2: Fallback — verify via accessToken using Google userinfo API
    if (!idTokenVerified && accessToken) {
      console.log('Falling back to accessToken verification via Google userinfo API');
      const resp = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Google userinfo API failed:', resp.status, errText);
        return res.status(401).json({ success: false, message: 'Invalid Google tokens' });
      }
      const info = await resp.json();
      googleId = info.sub;
      email    = info.email;
      name     = info.name;
      picture  = info.picture;
    }

    if (!idTokenVerified && !accessToken) {
      return res.status(401).json({ success: false, message: 'Google token verification failed' });
    }

    if (!email) return res.status(400).json({ success: false, message: 'Email not found in Google account' });

    // Check if user exists (by google_id or email)
    let result = await query(
      'SELECT * FROM users WHERE google_id = $1 OR email = $2 LIMIT 1',
      [googleId, email.toLowerCase()]
    );

    let user;
    if (result.rowCount > 0) {
      // Existing user — update google_id if not set
      user = result.rows[0];
      if (!user.google_id) {
        await query('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3',
          [googleId, picture, user.id]);
      }
    } else {
      // New user — create account
      const newUser = await query(
        `INSERT INTO users (full_name, email, google_id, avatar_url)
         VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, email, phone`,
        [name, email.toLowerCase(), googleId, picture || '']
      );
      user = newUser.rows[0];
    }

    const token = signToken(user.id);
    return res.json({
      success: true, token,
      user: { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone || '' },
    });
  } catch (err) {
    console.error('Google auth error:', err.message, err.stack);
    return res.status(500).json({ success: false, message: 'Google authentication failed: ' + err.message });
  }
});

module.exports = router;
