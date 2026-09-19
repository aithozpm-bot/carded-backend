const crypto = require('crypto');
const express = require('express');
const { getAnalytics, parseFilters } = require('../analytics/data');
const { renderAnalyticsPage } = require('../analytics/page');

const router = express.Router();

const ANALYTICS_SECRET = 'crd7Qs9mK2xVp8Nw4Jf6Ty3Ha5Lc1Ze0RuBgD';

function secretsMatch(received, expected) {
  if (!received || !expected) return false;
  const receivedHash = crypto.createHash('sha256').update(String(received)).digest();
  const expectedHash = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(receivedHash, expectedHash);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function analyticsCsv(data) {
  const lines = [
    ['bucket', 'new_users', 'cards_created', 'cards_collected'],
    ...data.trend.map((row) => [
      new Date(row.bucket).toISOString(),
      row.users,
      row.cards,
      row.scans,
    ]),
  ];
  return lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

router.get('/', async (req, res) => {
  const suppliedSecret = req.query.secret || req.get('x-analytics-secret');

  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });

  if (!secretsMatch(suppliedSecret, ANALYTICS_SECRET)) {
    return res.status(404).type('text/plain').send('Not found');
  }

  try {
    const filters = parseFilters(req.query);
    const data = await getAnalytics(filters);

    if (req.query.format === 'json') {
      return res.json(data);
    }
    if (req.query.format === 'csv') {
      const stamp = new Date().toISOString().slice(0, 10);
      res.attachment(`carded-analytics-${stamp}.csv`);
      return res.type('text/csv').send(analyticsCsv(data));
    }

    return res.type('html').send(renderAnalyticsPage(data, suppliedSecret));
  } catch (error) {
    console.error('[analytics] Failed to load dashboard:', error);
    return res.status(500).type('text/plain').send('Unable to load analytics right now.');
  }
});

module.exports = router;
