'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security / Middleware ──────────────────────────────────────────────────────
// Default to same-origin only; set ALLOWED_ORIGIN env var to enable cross-origin access
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Global rate limiter – protects upstream provider quota and prevents abuse
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use(globalLimiter);

// Stricter limiter for write/action endpoints
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many swap requests. Please wait a moment.' },
});
app.use('/api/create', createLimiter);

// ── Static files ───────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Fallback: serve index for any unmatched GET (SPA-style) ───────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handler ──────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[SwapPro Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[SwapPro] Server running on http://localhost:${PORT}`);
});

module.exports = app;
