'use strict';

/**
 * SwapPro API Routes
 *
 * Endpoints:
 *   GET  /api/rate            – Fetch swap rate (with margin applied)
 *   POST /api/create          – Create a new swap transaction
 *   GET  /api/status/:id      – Poll transaction status by ID
 *   GET  /api/currencies      – List supported currencies
 *   GET  /api/min-amount      – Fetch minimum swap amount for a pair
 */

const express = require('express');
const axios = require('axios');

const router = express.Router();

const BASE_URL = 'https://api.changenow.io/v1';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve the margin to apply based on premium flag and environment config.
 * @param {boolean} premium
 * @returns {number} margin as a decimal (e.g. 0.005 for 0.5 %)
 */
function resolveMargin(premium) {
  const defaultMargin = parseFloat(process.env.MARGIN_PERCENT || '0.5') / 100;
  const premiumMargin = parseFloat(process.env.PREMIUM_MARGIN_PERCENT || '0.2') / 100;
  return premium ? premiumMargin : defaultMargin;
}

/**
 * Apply margin: reduce the estimated output so the platform earns on each swap.
 * @param {number} estimatedAmount  Raw provider output
 * @param {number} margin           Decimal margin (e.g. 0.005)
 * @returns {number}
 */
function applyMargin(estimatedAmount, margin) {
  return estimatedAmount * (1 - margin);
}

/**
 * Compute a "deal score" (0–100) based on how good the effective rate is.
 * Higher margin → lower score; no margin → 100.
 * @param {number} margin Decimal margin
 * @returns {number}
 */
function dealScore(margin) {
  // Scale: 0 % margin = 100 pts, 2 % margin = 0 pts
  const score = Math.max(0, Math.round(100 - margin * 5000));
  return score;
}

/**
 * Map ChangeNOW raw status values to SwapPro display statuses.
 * @param {string} rawStatus
 * @returns {{ status: string, label: string, step: number }}
 */
function mapStatus(rawStatus) {
  const map = {
    new:        { status: 'pending',    label: 'Awaiting Deposit',   step: 1 },
    waiting:    { status: 'pending',    label: 'Awaiting Deposit',   step: 1 },
    confirming: { status: 'confirming', label: 'Confirming',         step: 2 },
    exchanging: { status: 'confirming', label: 'Exchanging',         step: 2 },
    sending:    { status: 'confirming', label: 'Sending Funds',      step: 3 },
    finished:   { status: 'completed',  label: 'Completed',          step: 4 },
    failed:     { status: 'failed',     label: 'Failed',             step: 0 },
    refunded:   { status: 'refunded',   label: 'Refunded',           step: 0 },
    expired:    { status: 'expired',    label: 'Expired',            step: 0 },
    verifying:  { status: 'confirming', label: 'Verifying',          step: 2 },
  };
  return map[rawStatus] || { status: rawStatus, label: rawStatus, step: 0 };
}

/**
 * Central axios wrapper for ChangeNOW requests.
 * Throws a sanitized error so API keys never leak to clients.
 */
async function cnRequest(method, path, data = null) {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey || apiKey === 'your_changenow_api_key_here') {
    throw Object.assign(new Error('Provider API key not configured.'), { status: 503 });
  }
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      params: method === 'get' ? { api_key: apiKey } : undefined,
    };
    if (data) config.data = { ...data, api_key: apiKey };
    const response = await axios(config);
    return response.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    const status = err.response?.status || 502;
    throw Object.assign(new Error(msg), { status });
  }
}

// ── Input validators ───────────────────────────────────────────────────────────

const CURRENCY_RE = /^[a-zA-Z0-9]{1,10}$/;
const ADDRESS_RE  = /^[a-zA-Z0-9]{10,128}$/;
const TX_ID_RE    = /^[a-zA-Z0-9]{8,64}$/;

function validateCurrency(val) {
  return typeof val === 'string' && CURRENCY_RE.test(val);
}
function validateAddress(val) {
  return typeof val === 'string' && ADDRESS_RE.test(val);
}
function validateTxId(val) {
  return typeof val === 'string' && TX_ID_RE.test(val);
}

// ── GET /api/currencies ────────────────────────────────────────────────────────
router.get('/currencies', async (req, res, next) => {
  try {
    const data = await cnRequest('get', '/currencies?active=true&fixedRate=false');
    // Only expose safe fields
    const currencies = data.map(({ ticker, name, image }) => ({ ticker, name, image }));
    res.json(currencies);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/min-amount ────────────────────────────────────────────────────────
router.get('/min-amount', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!validateCurrency(from) || !validateCurrency(to)) {
      return res.status(400).json({ error: 'Invalid currency tickers.' });
    }
    const data = await cnRequest('get', `/min-amount/${from}_${to}`);
    res.json({ minAmount: data.minAmount });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/rate ──────────────────────────────────────────────────────────────
router.get('/rate', async (req, res, next) => {
  try {
    const { from, to, amount, premium } = req.query;

    if (!validateCurrency(from) || !validateCurrency(to)) {
      return res.status(400).json({ error: 'Invalid currency tickers.' });
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    const isPremium = premium === 'true' || premium === '1';
    const margin = resolveMargin(isPremium);

    // Fetch estimated amount from ChangeNOW
    const data = await cnRequest('get', `/exchange-amount/${parsedAmount}/${from.toLowerCase()}_${to.toLowerCase()}`);

    const rawEstimate   = parseFloat(data.estimatedAmount);
    const adjustedOut   = parseFloat(applyMargin(rawEstimate, margin).toFixed(8));
    const fee           = parseFloat((rawEstimate - adjustedOut).toFixed(8));
    const effectiveRate = parseFloat((adjustedOut / parsedAmount).toFixed(8));
    const score         = dealScore(margin);

    res.json({
      from: from.toLowerCase(),
      to:   to.toLowerCase(),
      amountIn:       parsedAmount,
      estimatedOut:   adjustedOut,
      rawEstimate,
      fee,
      effectiveRate,
      margin:         `${(margin * 100).toFixed(2)}%`,
      dealScore:      score,
      premium:        isPremium,
      provider:       'changenow',
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/create ───────────────────────────────────────────────────────────
router.post('/create', async (req, res, next) => {
  try {
    const { from, to, amount, address, refundAddress, premium } = req.body;

    if (!validateCurrency(from) || !validateCurrency(to)) {
      return res.status(400).json({ error: 'Invalid currency tickers.' });
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }
    if (!validateAddress(address)) {
      return res.status(400).json({ error: 'Invalid destination address.' });
    }
    if (refundAddress && !validateAddress(refundAddress)) {
      return res.status(400).json({ error: 'Invalid refund address.' });
    }

    const isPremium = premium === true || premium === 'true';

    const payload = {
      from:          from.toLowerCase(),
      to:            to.toLowerCase(),
      amount:        parsedAmount,
      address,
      refundAddress: refundAddress || '',
      extraId:       '',
      userId:        '',
      contactEmail:  '',
      flow:          'standard',
    };

    const data = await cnRequest('post', '/transactions', payload);

    // Only return fields necessary for the client
    res.status(201).json({
      id:           data.id,
      payinAddress: data.payinAddress,
      payoutAddress: data.payoutAddress,
      from:          data.fromCurrency,
      to:            data.toCurrency,
      amountIn:      data.amount,
      premium:       isPremium,
      provider:      'changenow',
      createdAt:     data.createdAt || new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/status/:id ────────────────────────────────────────────────────────
/**
 * Transaction status tracking endpoint.
 * Returns normalized status, step indicator, and key transaction fields.
 * Designed for real-time polling (every 10 s from the client).
 */
router.get('/status/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!validateTxId(id)) {
      return res.status(400).json({ error: 'Invalid transaction ID.' });
    }

    const data = await cnRequest('get', `/transactions/${id}`);

    const { status: mappedStatus, label, step } = mapStatus(data.status);

    res.json({
      id:            data.id,
      status:        mappedStatus,
      label,
      step,           // 1 = pending, 2 = confirming, 3 = sending, 4 = completed
      from:          data.fromCurrency,
      to:            data.toCurrency,
      amountIn:      data.amountFrom,
      expectedOut:   data.amountTo,
      payinAddress:  data.payinAddress,
      payoutAddress: data.payoutAddress,
      payinHash:     data.payinHash   || null,
      payoutHash:    data.payoutHash  || null,
      provider:      'changenow',
      updatedAt:     new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
