const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes         = require('./routes/auth');
const cardsRoutes        = require('./routes/cards');
const collectedRoutes    = require('./routes/collected');
const deleteAccountRoutes = require('./routes/deleteAccount');

const swaggerUi   = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const app = express();

app.set('trust proxy', 1);

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Swagger ─────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Carded API Docs',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// ─── Routes ───────────────────────────────────────────────────
app.use('/',          deleteAccountRoutes);
app.use('/auth',      authRoutes);
app.use('/cards',     cardsRoutes);
app.use('/collected', collectedRoutes);

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Carded API', version: '1.0.0', db: 'PostgreSQL (Neon)' });
});

// ─── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start (local dev only — Vercel uses module.exports) ──────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🃏 Carded API running on http://localhost:${PORT}`);
    console.log(`   Swagger  → http://localhost:${PORT}/api-docs`);
    console.log(`   Health   → http://localhost:${PORT}/health`);
  });
}

module.exports = app;