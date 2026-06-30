const { query } = require('../db/pool');
const { getRequestMeta } = require('./requestMeta');

const LIMITS = {
  forgot_password: {
    perEmail: { max: 3, windowMinutes: 60 },
    perIp: { max: 10, windowMinutes: 60 },
    cooldownMinutes: 3,
  },
  login: {
    perEmail: { max: 5, windowMinutes: 15 },
    perIp: { max: 10, windowMinutes: 15 },
  },
  verify_otp: {
    perEmail: { max: 10, windowMinutes: 15 },
    perIp: { max: 20, windowMinutes: 15 },
  },
};

async function countEvents({ action, email, ip, windowMinutes, successOnly = false }) {
  const conditions = [`action = $1`, `created_at > NOW() - ($2 || ' minutes')::INTERVAL`];
  const params = [action, String(windowMinutes)];
  let idx = 3;

  if (email) {
    conditions.push(`LOWER(email) = LOWER($${idx})`);
    params.push(email);
    idx++;
  }
  if (ip) {
    conditions.push(`ip = $${idx}`);
    params.push(ip);
    idx++;
  }
  if (successOnly) {
    conditions.push('success = true');
  }

  const result = await query(
    `SELECT COUNT(*)::INT AS count FROM auth_events WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows[0].count;
}

async function getLastSuccessAt(action, email) {
  const result = await query(
    `SELECT created_at FROM auth_events
     WHERE action = $1 AND LOWER(email) = LOWER($2) AND success = true
     ORDER BY created_at DESC LIMIT 1`,
    [action, email]
  );
  return result.rows[0]?.created_at || null;
}

async function logAuthEvent(req, { action, email = null, userId = null, success = false, meta = {} }) {
  const { ip, userAgent } = getRequestMeta(req);
  try {
    await query(
      `INSERT INTO auth_events (action, email, user_id, ip, user_agent, success, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        action,
        email ? email.toLowerCase().trim() : null,
        userId,
        ip,
        userAgent,
        success,
        JSON.stringify(meta),
      ]
    );
  } catch (err) {
    console.error('[authSecurity] Failed to log event:', err.message);
  }
  return { ip, userAgent };
}

async function checkForgotPasswordLimits(email, ip) {
  const cfg = LIMITS.forgot_password;
  const normalizedEmail = email.toLowerCase().trim();

  const lastSent = await getLastSuccessAt('forgot_password', normalizedEmail);
  if (lastSent) {
    const cooldownMs = cfg.cooldownMinutes * 60 * 1000;
    if (Date.now() - new Date(lastSent).getTime() < cooldownMs) {
      return {
        allowed: false,
        status: 429,
        message: `Please wait ${cfg.cooldownMinutes} minutes before requesting another reset code.`,
      };
    }
  }

  const emailCount = await countEvents({
    action: 'forgot_password',
    email: normalizedEmail,
    windowMinutes: cfg.perEmail.windowMinutes,
    successOnly: true,
  });
  if (emailCount >= cfg.perEmail.max) {
    return {
      allowed: false,
      status: 429,
      message: 'Too many reset requests for this email. Try again in an hour.',
    };
  }

  const ipCount = await countEvents({
    action: 'forgot_password',
    ip,
    windowMinutes: cfg.perIp.windowMinutes,
  });
  if (ipCount >= cfg.perIp.max) {
    return {
      allowed: false,
      status: 429,
      message: 'Too many requests from this network. Please try again later.',
    };
  }

  return { allowed: true };
}

async function checkLoginLimits(emailOrPhone, ip) {
  const cfg = LIMITS.login;
  const val = emailOrPhone.toLowerCase().trim();

  const emailCount = await countEvents({
    action: 'login_failed',
    email: val,
    windowMinutes: cfg.perEmail.windowMinutes,
  });
  if (emailCount >= cfg.perEmail.max) {
    return {
      allowed: false,
      status: 429,
      message: 'Too many failed login attempts. Try again in 15 minutes.',
    };
  }

  const ipCount = await countEvents({
    action: 'login_failed',
    ip,
    windowMinutes: cfg.perIp.windowMinutes,
  });
  if (ipCount >= cfg.perIp.max) {
    return {
      allowed: false,
      status: 429,
      message: 'Too many login attempts from this network. Please try again later.',
    };
  }

  return { allowed: true };
}

async function checkVerifyOtpLimits(email, ip) {
  const cfg = LIMITS.verify_otp;
  const normalizedEmail = email.toLowerCase().trim();

  const emailCount = await countEvents({
    action: 'verify_otp_failed',
    email: normalizedEmail,
    windowMinutes: cfg.perEmail.windowMinutes,
  });
  if (emailCount >= cfg.perEmail.max) {
    return {
      allowed: false,
      status: 429,
      message: 'Too many OTP attempts. Try again in 15 minutes.',
    };
  }

  const ipCount = await countEvents({
    action: 'verify_otp_failed',
    ip,
    windowMinutes: cfg.perIp.windowMinutes,
  });
  if (ipCount >= cfg.perIp.max) {
    return {
      allowed: false,
      status: 429,
      message: 'Too many requests from this network. Please try again later.',
    };
  }

  return { allowed: true };
}

module.exports = {
  logAuthEvent,
  checkForgotPasswordLimits,
  checkLoginLimits,
  checkVerifyOtpLimits,
  getRequestMeta,
};
