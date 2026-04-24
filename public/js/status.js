/**
 * status.js – SwapPro transaction status tracker
 *
 * Features:
 *  - Reads transaction ID from URL query param ?id=
 *  - Polls /api/status/:id every 10 seconds
 *  - Shows step-by-step progress tracker
 *  - Color-coded status badge
 *  - Displays provider, expected output, and blockchain hashes
 *  - Stops polling when terminal state reached (completed/failed/refunded/expired)
 *  - Manual stop / resume controls
 */

'use strict';

const POLL_INTERVAL_MS  = 10_000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'refunded', 'expired']);

// ── Element refs ───────────────────────────────────────────────────────────────
const txIdInput      = document.getElementById('txIdInput');
const trackBtn       = document.getElementById('trackBtn');
const inputError     = document.getElementById('inputError');

const statusPanel    = document.getElementById('statusPanel');
const loadingState   = document.getElementById('loadingState');
const errorState     = document.getElementById('errorState');
const errorMsg       = document.getElementById('errorMsg');
const emptyState     = document.getElementById('emptyState');

const displayTxId    = document.getElementById('displayTxId');
const stepTracker    = document.getElementById('stepTracker');
const statusBadge    = document.getElementById('statusBadge');
const statusIcon     = document.getElementById('statusIcon');
const statusLabel    = document.getElementById('statusLabel');
const lastUpdated    = document.getElementById('lastUpdated');
const liveIndicator  = document.getElementById('liveIndicator');

const detailFrom     = document.getElementById('detailFrom');
const detailTo       = document.getElementById('detailTo');
const detailProvider = document.getElementById('detailProvider');
const detailPayin    = document.getElementById('detailPayin');
const detailPayout   = document.getElementById('detailPayout');
const detailPayinHash  = document.getElementById('detailPayinHash');
const detailPayoutHash = document.getElementById('detailPayoutHash');

const stopPollingBtn  = document.getElementById('stopPollingBtn');
const startPollingBtn = document.getElementById('startPollingBtn');

// ── State ──────────────────────────────────────────────────────────────────────
let currentTxId  = null;
let pollTimer    = null;
let pollingActive = true;

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:    { icon: '⏳', color: 'status-pending',    bg: 'bg-status-pending'    },
  confirming: { icon: '🔄', color: 'status-confirming', bg: 'bg-status-confirming' },
  completed:  { icon: '✅', color: 'status-completed',  bg: 'bg-status-completed'  },
  failed:     { icon: '❌', color: 'status-failed',     bg: 'bg-status-failed'     },
  refunded:   { icon: '↩️', color: 'status-refunded',   bg: 'bg-status-refunded'   },
  expired:    { icon: '⌛', color: 'status-expired',    bg: 'bg-status-expired'    },
};

const STEPS = [
  { label: 'Deposit',     step: 1 },
  { label: 'Confirming',  step: 2 },
  { label: 'Sending',     step: 3 },
  { label: 'Completed',   step: 4 },
];

// ── UI helpers ─────────────────────────────────────────────────────────────────
function showPanel(name) {
  [statusPanel, loadingState, errorState, emptyState].forEach(el => el.classList.add('hidden'));
  if (name === 'status')  { statusPanel.classList.remove('hidden'); }
  if (name === 'loading') { loadingState.classList.remove('hidden'); }
  if (name === 'error')   { errorState.classList.remove('hidden'); }
  if (name === 'empty')   { emptyState.classList.remove('hidden'); }
}

function fmt(num, currency) {
  if (num == null || isNaN(parseFloat(num))) return '—';
  return `${parseFloat(num).toFixed(8)} ${String(currency).toUpperCase()}`;
}

function relativeTime(isoString) {
  const diff = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 5)  return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.round(diff / 60)}m ago`;
}

// ── Step tracker renderer ──────────────────────────────────────────────────────
function renderSteps(activeStep) {
  stepTracker.innerHTML = '';

  STEPS.forEach((s, idx) => {
    const isActive   = s.step <= activeStep;
    const isCurrent  = s.step === activeStep;

    // Dot
    const dot = document.createElement('div');
    dot.className = [
      'flex flex-col items-center gap-1',
    ].join(' ');

    const circle = document.createElement('div');
    circle.className = [
      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
      isActive
        ? 'bg-brand-500 border-brand-500 text-white'
        : 'bg-transparent border-slate-600 text-slate-600',
      isCurrent ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-900' : '',
    ].join(' ');
    circle.textContent = s.step;

    const labelEl = document.createElement('span');
    labelEl.className = `text-xs ${isActive ? 'text-brand-400' : 'text-slate-600'} whitespace-nowrap`;
    labelEl.textContent = s.label;

    dot.appendChild(circle);
    dot.appendChild(labelEl);
    stepTracker.appendChild(dot);

    // Connector line (not after last)
    if (idx < STEPS.length - 1) {
      const line = document.createElement('div');
      line.className = `step-connector mt-[-18px] ${isActive && activeStep > s.step ? 'active' : ''}`;
      stepTracker.appendChild(line);
    }
  });
}

// ── Status badge renderer ──────────────────────────────────────────────────────
function renderStatusBadge(status, label) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  statusBadge.className = `flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.color}`;
  statusIcon.textContent  = cfg.icon;
  statusLabel.textContent = label;
}

// ── Render full status data ────────────────────────────────────────────────────
function renderStatus(data) {
  displayTxId.textContent = data.id;

  // Step tracker
  const step = TERMINAL_STATUSES.has(data.status) && data.status !== 'completed'
    ? 0
    : (data.step || 1);
  renderSteps(step);

  // Badge
  renderStatusBadge(data.status, data.label);

  // Details
  detailFrom.textContent     = fmt(data.amountIn, data.from);
  detailTo.textContent       = fmt(data.expectedOut, data.to);
  detailProvider.textContent = data.provider || 'changenow';
  detailPayin.textContent    = data.payinAddress  || '—';
  detailPayout.textContent   = data.payoutAddress || '—';
  detailPayinHash.textContent  = data.payinHash  || 'Awaiting deposit…';
  detailPayoutHash.textContent = data.payoutHash || 'Awaiting completion…';

  lastUpdated.textContent = `Updated ${relativeTime(data.updatedAt)}`;

  // Live indicator: hide when terminal
  const isTerminal = TERMINAL_STATUSES.has(data.status);
  liveIndicator.classList.toggle('hidden', isTerminal);

  showPanel('status');
}

// ── Fetch & update ─────────────────────────────────────────────────────────────
async function fetchStatus(txId, isInitial = false) {
  if (isInitial) showPanel('loading');

  try {
    const res  = await fetch(`/api/status/${encodeURIComponent(txId)}`);
    const data = await res.json();

    if (!res.ok) {
      if (isInitial) {
        errorMsg.textContent = data.error || 'Could not fetch transaction status.';
        showPanel('error');
      }
      return;
    }

    renderStatus(data);

    // Stop polling if terminal state reached
    if (TERMINAL_STATUSES.has(data.status)) {
      stopPolling();
      liveIndicator.classList.add('hidden');
      stopPollingBtn.classList.add('hidden');
      startPollingBtn.classList.add('hidden');
    }
  } catch {
    if (isInitial) {
      errorMsg.textContent = 'Network error. Check your connection and try again.';
      showPanel('error');
    }
    // On subsequent polls, silently skip – keep last known state visible
  }
}

// ── Polling control ────────────────────────────────────────────────────────────
function startPolling(txId) {
  stopPolling();
  pollingActive = true;
  pollTimer = setInterval(() => fetchStatus(txId), POLL_INTERVAL_MS);
  stopPollingBtn.classList.remove('hidden');
  startPollingBtn.classList.add('hidden');
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  pollingActive = false;
}

// ── Track a transaction ────────────────────────────────────────────────────────
async function track(txId) {
  txId = txId.trim();
  if (!txId) {
    inputError.textContent = 'Please enter a transaction ID.';
    inputError.classList.remove('hidden');
    return;
  }
  // Basic client-side validation
  if (!/^[a-zA-Z0-9]{8,64}$/.test(txId)) {
    inputError.textContent = 'Invalid transaction ID format.';
    inputError.classList.remove('hidden');
    return;
  }
  inputError.classList.add('hidden');

  currentTxId = txId;
  txIdInput.value = txId;

  // Update URL without reload
  const url = new URL(window.location.href);
  url.searchParams.set('id', txId);
  window.history.pushState({}, '', url.toString());

  await fetchStatus(txId, true);
  startPolling(txId);
}

// ── Events ─────────────────────────────────────────────────────────────────────
trackBtn.addEventListener('click', () => track(txIdInput.value));
txIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') track(txIdInput.value);
});

stopPollingBtn.addEventListener('click', () => {
  stopPolling();
  stopPollingBtn.classList.add('hidden');
  startPollingBtn.classList.remove('hidden');
});

startPollingBtn.addEventListener('click', () => {
  if (currentTxId) {
    startPolling(currentTxId);
  }
});

// ── Init: read ?id= from URL ───────────────────────────────────────────────────
(function init() {
  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');
  if (idParam) {
    txIdInput.value = idParam;
    track(idParam);
  } else {
    showPanel('empty');
  }
})();
