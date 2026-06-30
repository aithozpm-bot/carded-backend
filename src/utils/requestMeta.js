/**
 * Extract client IP and user-agent from Express request (Vercel-aware).
 */
function getRequestMeta(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string'
    ? forwarded.split(',')[0]
    : req.socket?.remoteAddress || req.ip || 'unknown'
  ).trim();

  const userAgent = (req.headers['user-agent'] || 'unknown').slice(0, 512);

  return { ip, userAgent };
}

module.exports = { getRequestMeta };
