const { query } = require('../db/pool');

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function parseFilters(input = {}) {
  const now = new Date();
  const range = Object.prototype.hasOwnProperty.call(RANGE_DAYS, input.range)
    ? input.range
    : (input.range === 'custom' ? 'custom' : '30d');

  let to = new Date(now);
  let from;

  if (range === 'custom' && validDate(input.start) && validDate(input.end)) {
    from = new Date(`${input.start}T00:00:00Z`);
    to = new Date(`${input.end}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    if (from >= to) {
      from = new Date(to.getTime() - (30 * DAY_MS));
    }
  } else {
    from = new Date(to.getTime() - (RANGE_DAYS[range] || 30) * DAY_MS);
  }

  // Prevent accidental or malicious queries spanning unreasonable time windows.
  const maxWindow = 5 * 365 * DAY_MS;
  if (to.getTime() - from.getTime() > maxWindow) {
    from = new Date(to.getTime() - maxWindow);
  }

  const duration = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - duration);
  const clean = (value, max = 80) => String(value || '').trim().slice(0, max);

  return {
    range,
    from,
    to,
    previousFrom,
    scanType: clean(input.scanType),
    category: clean(input.category),
    leadType: clean(input.leadType),
  };
}

function collectedFilter(filters, alias = 'cc', startIndex = 1) {
  const values = [filters.from, filters.to];
  const clauses = [
    `${alias}.scanned_at >= $${startIndex}`,
    `${alias}.scanned_at < $${startIndex + 1}`,
  ];

  for (const [column, value] of [
    ['scan_type', filters.scanType],
    ['category', filters.category],
    ['lead_type', filters.leadType],
  ]) {
    if (value) {
      values.push(value);
      clauses.push(`${alias}.${column} = $${startIndex + values.length - 1}`);
    }
  }

  return { sql: clauses.join(' AND '), values };
}

function percentChange(current, previous) {
  const a = Number(current || 0);
  const b = Number(previous || 0);
  if (b === 0) return a === 0 ? 0 : null;
  return ((a - b) / b) * 100;
}

async function getAnalytics(filters) {
  const collected = collectedFilter(filters);
  const dimensionValues = collected.values.slice(2);
  const dimensionClauses = [];
  let dimensionIndex = 3;

  for (const [column, value] of [
    ['scan_type', filters.scanType],
    ['category', filters.category],
    ['lead_type', filters.leadType],
  ]) {
    if (value) {
      dimensionClauses.push(`cc.${column} = $${dimensionIndex++}`);
    }
  }
  const dimensionSql = dimensionClauses.length ? ` AND ${dimensionClauses.join(' AND ')}` : '';

  const windowDays = Math.ceil((filters.to - filters.from) / DAY_MS);
  const bucket = windowDays <= 45 ? 'day' : windowDays <= 370 ? 'week' : 'month';

  const started = Date.now();
  const [
    totalsResult,
    periodResult,
    previousResult,
    funnelResult,
    trendResult,
    scansResult,
    categoriesResult,
    leadsResult,
    authResult,
    qualityResult,
    topUsersResult,
    recentUsersResult,
    optionsResult,
  ] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*)::INT FROM users) AS users,
        (SELECT COUNT(*)::INT FROM cards) AS cards,
        (SELECT COUNT(*)::INT FROM collected_cards) AS collected,
        (SELECT COUNT(*)::INT FROM auth_events) AS auth_events
    `),
    query(`
      SELECT
        (SELECT COUNT(*)::INT FROM users WHERE created_at >= $1 AND created_at < $2) AS users,
        (SELECT COUNT(*)::INT FROM cards WHERE created_at >= $1 AND created_at < $2) AS cards,
        (SELECT COUNT(*)::INT FROM collected_cards cc WHERE ${collected.sql}) AS collected,
        (SELECT COUNT(DISTINCT user_id)::INT FROM (
          SELECT user_id FROM cards WHERE created_at >= $1 AND created_at < $2
          UNION
          SELECT cc.user_id FROM collected_cards cc WHERE ${collected.sql}
          UNION
          SELECT user_id FROM auth_events
          WHERE created_at >= $1 AND created_at < $2 AND user_id IS NOT NULL
        ) activity) AS active_users
    `, collected.values),
    query(`
      SELECT
        (SELECT COUNT(*)::INT FROM users WHERE created_at >= $1 AND created_at < $2) AS users,
        (SELECT COUNT(*)::INT FROM cards WHERE created_at >= $1 AND created_at < $2) AS cards,
        (SELECT COUNT(*)::INT FROM collected_cards cc
          WHERE cc.scanned_at >= $1 AND cc.scanned_at < $2${dimensionSql}) AS collected
    `, [filters.previousFrom, filters.from, ...dimensionValues]),
    query(`
      SELECT
        COUNT(*)::INT AS users,
        COUNT(*) FILTER (WHERE card_count > 0)::INT AS with_card,
        COUNT(*) FILTER (WHERE scan_count > 0)::INT AS with_scan,
        COUNT(*) FILTER (WHERE card_count > 0 AND scan_count > 0)::INT AS activated,
        COALESCE(AVG(card_count), 0)::NUMERIC(10,2) AS avg_cards,
        COALESCE(AVG(scan_count), 0)::NUMERIC(10,2) AS avg_scans
      FROM (
        SELECT u.id,
          (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id) AS card_count,
          (SELECT COUNT(*) FROM collected_cards cc WHERE cc.user_id = u.id) AS scan_count
        FROM users u
      ) x
    `),
    query(`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('${bucket}', $1::timestamptz),
          date_trunc('${bucket}', $2::timestamptz - INTERVAL '1 millisecond'),
          INTERVAL '1 ${bucket}'
        ) AS bucket
      ),
      users_by_bucket AS (
        SELECT date_trunc('${bucket}', created_at) AS bucket, COUNT(*)::INT AS count
        FROM users WHERE created_at >= $1 AND created_at < $2 GROUP BY 1
      ),
      cards_by_bucket AS (
        SELECT date_trunc('${bucket}', created_at) AS bucket, COUNT(*)::INT AS count
        FROM cards WHERE created_at >= $1 AND created_at < $2 GROUP BY 1
      ),
      scans_by_bucket AS (
        SELECT date_trunc('${bucket}', cc.scanned_at) AS bucket, COUNT(*)::INT AS count
        FROM collected_cards cc WHERE ${collected.sql} GROUP BY 1
      )
      SELECT b.bucket,
        COALESCE(u.count, 0)::INT AS users,
        COALESCE(c.count, 0)::INT AS cards,
        COALESCE(s.count, 0)::INT AS scans
      FROM buckets b
      LEFT JOIN users_by_bucket u USING (bucket)
      LEFT JOIN cards_by_bucket c USING (bucket)
      LEFT JOIN scans_by_bucket s USING (bucket)
      ORDER BY b.bucket
    `, collected.values),
    query(`
      SELECT COALESCE(NULLIF(scan_type, ''), 'unknown') AS label, COUNT(*)::INT AS value
      FROM collected_cards cc WHERE ${collected.sql}
      GROUP BY 1 ORDER BY value DESC, label LIMIT 12
    `, collected.values),
    query(`
      SELECT COALESCE(NULLIF(category, ''), 'Uncategorized') AS label, COUNT(*)::INT AS value
      FROM collected_cards cc WHERE ${collected.sql}
      GROUP BY 1 ORDER BY value DESC, label LIMIT 12
    `, collected.values),
    query(`
      SELECT COALESCE(NULLIF(lead_type, ''), 'Unspecified') AS label, COUNT(*)::INT AS value
      FROM collected_cards cc WHERE ${collected.sql}
      GROUP BY 1 ORDER BY value DESC, label LIMIT 12
    `, collected.values),
    query(`
      SELECT
        COUNT(*)::INT AS attempts,
        COUNT(*) FILTER (WHERE action = 'login_success')::INT AS login_success,
        COUNT(*) FILTER (WHERE action = 'login_failed')::INT AS login_failed,
        COUNT(*) FILTER (WHERE action = 'forgot_password')::INT AS password_resets,
        COUNT(*) FILTER (WHERE action = 'verify_otp_failed')::INT AS otp_failed,
        COUNT(*) FILTER (WHERE meta->>'reason' = 'rate_limited')::INT AS rate_limited,
        COUNT(DISTINCT user_id) FILTER (WHERE action = 'login_success')::INT AS unique_logins
      FROM auth_events WHERE created_at >= $1 AND created_at < $2
    `, [filters.from, filters.to]),
    query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE email1 <> '')::INT AS with_email,
        COUNT(*) FILTER (WHERE phone1 <> '')::INT AS with_phone,
        COUNT(*) FILTER (WHERE company <> '')::INT AS with_company,
        COUNT(*) FILTER (WHERE website <> '')::INT AS with_website,
        COUNT(*) FILTER (WHERE remarks <> '')::INT AS with_remarks,
        COUNT(*) FILTER (WHERE photo_url <> '' OR card_image_url <> '')::INT AS with_image
      FROM collected_cards cc WHERE ${collected.sql}
    `, collected.values),
    query(`
      SELECT u.full_name, u.email, u.created_at,
        COUNT(DISTINCT c.id)::INT AS cards,
        COUNT(DISTINCT cc.id)::INT AS scans,
        MAX(cc.scanned_at) AS last_scan
      FROM users u
      LEFT JOIN cards c ON c.user_id = u.id
      LEFT JOIN collected_cards cc ON cc.user_id = u.id
      GROUP BY u.id
      ORDER BY scans DESC, cards DESC, u.created_at DESC
      LIMIT 10
    `),
    query(`
      SELECT u.full_name, u.email, u.created_at,
        (SELECT COUNT(*)::INT FROM cards c WHERE c.user_id = u.id) AS cards,
        (SELECT COUNT(*)::INT FROM collected_cards cc WHERE cc.user_id = u.id) AS scans
      FROM users u ORDER BY u.created_at DESC LIMIT 10
    `),
    query(`
      SELECT
        ARRAY(SELECT DISTINCT scan_type FROM collected_cards WHERE scan_type <> '' ORDER BY 1) AS scan_types,
        ARRAY(SELECT DISTINCT category FROM collected_cards WHERE category <> '' ORDER BY 1) AS categories,
        ARRAY(SELECT DISTINCT lead_type FROM collected_cards WHERE lead_type <> '' ORDER BY 1) AS lead_types
    `),
  ]);

  const totals = totalsResult.rows[0];
  const period = periodResult.rows[0];
  const previous = previousResult.rows[0];
  const funnel = funnelResult.rows[0];
  const auth = authResult.rows[0];
  const quality = qualityResult.rows[0];

  return {
    generatedAt: new Date().toISOString(),
    queryTimeMs: Date.now() - started,
    bucket,
    filters,
    totals,
    period,
    previous,
    growth: {
      users: percentChange(period.users, previous.users),
      cards: percentChange(period.cards, previous.cards),
      collected: percentChange(period.collected, previous.collected),
    },
    funnel,
    trend: trendResult.rows,
    scans: scansResult.rows,
    categories: categoriesResult.rows,
    leads: leadsResult.rows,
    auth,
    quality,
    topUsers: topUsersResult.rows,
    recentUsers: recentUsersResult.rows,
    options: optionsResult.rows[0],
  };
}

module.exports = { getAnalytics, parseFilters };
