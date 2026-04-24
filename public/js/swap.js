/**
 * swap.js – SwapPro swap form logic
 *
 * Handles:
 *  - Rate fetching with debounce
 *  - Fee breakdown display
 *  - Deal score badge
 *  - Premium mode toggle
 *  - Route display
 *  - Swap creation & success modal
 *  - Quick-track navigation
 */

'use strict';

// ── Element refs ───────────────────────────────────────────────────────────────
const amountIn       = document.getElementById('amountIn');
const fromCurrency   = document.getElementById('fromCurrency');
const toCurrency     = document.getElementById('toCurrency');
const amountOut      = document.getElementById('amountOut');
const destAddress    = document.getElementById('destAddress');
const refundAddress  = document.getElementById('refundAddress');
const premiumToggle  = document.getElementById('premiumToggle');
const swapBtn        = document.getElementById('swapBtn');
const swapBtnText    = document.getElementById('swapBtnText');
const errorMsg       = document.getElementById('errorMsg');
const dealBadge      = document.getElementById('dealBadge');
const feeBreakdown   = document.getElementById('feeBreakdown');
const routeCard      = document.getElementById('routeCard');
const premiumBadge   = document.getElementById('premiumBadge');
const swapCurrencies = document.getElementById('swapCurrencies');
const minAmountNote  = document.getElementById('minAmountNote');
const minAmountVal   = document.getElementById('minAmountVal');

// Fee breakdown fields
const fbAmountIn = document.getElementById('fbAmountIn');
const fbRaw      = document.getElementById('fbRaw');
const fbFee      = document.getElementById('fbFee');
const fbOut      = document.getElementById('fbOut');
const fbRate     = document.getElementById('fbRate');
const fbMargin   = document.getElementById('fbMargin');

// Modal
const successModal      = document.getElementById('successModal');
const modalTxId         = document.getElementById('modalTxId');
const modalPayinAddress = document.getElementById('modalPayinAddress');
const trackSwapBtn      = document.getElementById('trackSwapBtn');
const closeModal        = document.getElementById('closeModal');

// Quick track
const trackId  = document.getElementById('trackId');
const trackBtn = document.getElementById('trackBtn');

// ── State ──────────────────────────────────────────────────────────────────────
let debounceTimer = null;
let lastRate      = null;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(num, currency) {
  if (num == null || isNaN(num)) return '—';
  return `${parseFloat(num).toFixed(8)} ${currency.toUpperCase()}`;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function clearError() {
  errorMsg.classList.add('hidden');
  errorMsg.textContent = '';
}

function setSwapBtnState(state) {
  // state: 'enter' | 'loading' | 'ready' | 'submitting'
  swapBtn.disabled = state !== 'ready';
  const labels = {
    enter:      'Enter amount to continue',
    loading:    'Fetching rate…',
    ready:      'Swap Now →',
    submitting: 'Creating swap…',
  };
  swapBtnText.textContent = labels[state] || 'Swap Now';
}

function scoreColor(score) {
  if (score >= 80) return 'bg-brand-500/20 text-brand-400';
  if (score >= 60) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
}

// ── Rate fetch ─────────────────────────────────────────────────────────────────
async function fetchRate() {
  const amount = parseFloat(amountIn.value);
  const from   = fromCurrency.value;
  const to     = toCurrency.value;
  const premium = premiumToggle.checked;

  if (!amount || amount <= 0 || from === to) {
    amountOut.textContent = '—';
    feeBreakdown.classList.add('hidden');
    routeCard.classList.add('hidden');
    dealBadge.classList.add('hidden');
    setSwapBtnState('enter');
    return;
  }

  setSwapBtnState('loading');
  clearError();

  try {
    const params = new URLSearchParams({ from, to, amount, premium });
    const res  = await fetch(`/api/rate?${params}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to fetch rate.');
      amountOut.textContent = '—';
      setSwapBtnState('enter');
      return;
    }

    lastRate = data;

    // Output
    amountOut.textContent = `${data.estimatedOut} ${to.toUpperCase()}`;

    // Fee breakdown
    fbAmountIn.textContent = fmt(data.amountIn, from);
    fbRaw.textContent      = fmt(data.rawEstimate, to);
    fbFee.textContent      = `-${fmt(data.fee, to)}`;
    fbOut.textContent      = fmt(data.estimatedOut, to);
    fbRate.textContent     = `1 ${from.toUpperCase()} ≈ ${data.effectiveRate} ${to.toUpperCase()}`;
    fbMargin.textContent   = data.margin;
    feeBreakdown.classList.remove('hidden');

    // Deal score
    dealBadge.textContent  = `Deal Score: ${data.dealScore}/100`;
    dealBadge.className    = `text-xs px-2 py-1 rounded-full font-medium ${scoreColor(data.dealScore)}`;
    dealBadge.classList.remove('hidden');

    // Route card
    premiumBadge.classList.toggle('hidden', !data.premium);
    routeCard.classList.remove('hidden');

    setSwapBtnState('ready');
  } catch {
    showError('Network error. Please try again.');
    setSwapBtnState('enter');
  }
}

// ── Min amount fetch ───────────────────────────────────────────────────────────
async function fetchMinAmount() {
  const from = fromCurrency.value;
  const to   = toCurrency.value;
  if (from === to) return;
  try {
    const res  = await fetch(`/api/min-amount?from=${from}&to=${to}`);
    const data = await res.json();
    if (res.ok && data.minAmount) {
      minAmountVal.textContent = `${data.minAmount} ${from.toUpperCase()}`;
      minAmountNote.classList.remove('hidden');
    }
  } catch { /* non-critical */ }
}

// ── Debounced rate trigger ─────────────────────────────────────────────────────
function triggerRate() {
  clearTimeout(debounceTimer);
  setSwapBtnState('loading');
  debounceTimer = setTimeout(fetchRate, 600);
}

// ── Event listeners ────────────────────────────────────────────────────────────
amountIn.addEventListener('input', triggerRate);
fromCurrency.addEventListener('change', () => { fetchMinAmount(); triggerRate(); });
toCurrency.addEventListener('change',   () => { fetchMinAmount(); triggerRate(); });
premiumToggle.addEventListener('change', triggerRate);

swapCurrencies.addEventListener('click', () => {
  const tmp = fromCurrency.value;
  fromCurrency.value = toCurrency.value;
  toCurrency.value   = tmp;
  fetchMinAmount();
  triggerRate();
});

// ── Swap form submission ───────────────────────────────────────────────────────
swapBtn.addEventListener('click', async () => {
  const address = destAddress.value.trim();
  const refund  = refundAddress.value.trim();
  if (!address) { showError('Please enter a destination address.'); return; }

  clearError();
  setSwapBtnState('submitting');

  try {
    const res = await fetch('/api/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:          fromCurrency.value,
        to:            toCurrency.value,
        amount:        parseFloat(amountIn.value),
        address,
        refundAddress: refund,
        premium:       premiumToggle.checked,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to create swap.');
      setSwapBtnState('ready');
      return;
    }

    // Show success modal
    modalTxId.textContent         = data.id;
    modalPayinAddress.textContent = data.payinAddress;
    trackSwapBtn.dataset.txid     = data.id;
    successModal.classList.remove('hidden');
    successModal.classList.add('flex');
    setSwapBtnState('ready');
  } catch {
    showError('Network error. Please try again.');
    setSwapBtnState('ready');
  }
});

// ── Modal actions ──────────────────────────────────────────────────────────────
trackSwapBtn.addEventListener('click', () => {
  window.location.href = `/status.html?id=${trackSwapBtn.dataset.txid}`;
});

closeModal.addEventListener('click', () => {
  successModal.classList.add('hidden');
  successModal.classList.remove('flex');
});

successModal.addEventListener('click', (e) => {
  if (e.target === successModal) closeModal.click();
});

// ── Quick-track ────────────────────────────────────────────────────────────────
trackBtn.addEventListener('click', () => {
  const id = trackId.value.trim();
  if (id) window.location.href = `/status.html?id=${encodeURIComponent(id)}`;
});
trackId.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') trackBtn.click();
});

// ── Init ───────────────────────────────────────────────────────────────────────
fetchMinAmount();
setSwapBtnState('enter');
