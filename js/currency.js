/**
 * currency.js
 * ─────────────────────────────────────────────
 * Purpose: Shared real-time currency conversion helper, used only by
 *          the Pricing page. Reads the active currency from
 *          /settings/config (the same doc Settings already writes to)
 *          and fetches live USD exchange rates.
 *
 * All prices are stored in Firestore as USD (priceUSD). This module
 * converts USD -> the selected display currency using live rates from
 * a free, keyless exchange-rate API, cached in memory + localStorage
 * for 1 hour so we aren't re-fetching on every render.
 *
 * Exposes:
 *   window.CurrencyHelper.getActiveCurrency()      -> Promise<string>  e.g. "KES"
 *   window.CurrencyHelper.getRates()                -> Promise<object> { USD:1, KES:129.4, ... }
 *   window.CurrencyHelper.convert(usdAmount, code)   -> Promise<number>
 *   window.CurrencyHelper.format(amount, code)       -> string  e.g. "KES 1,250.00"
 *   window.CurrencyHelper.onCurrencyChange(callback)  -> subscribes to /settings/config currency changes
 */

(function () {
  const RATE_CACHE_KEY = 'stockwise_fx_rates_v1';
  const RATE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  const CURRENCY_SYMBOLS = {
    USD: '$', EUR: '€', GBP: '£', KES: 'KSh', NGN: '₦', ZAR: 'R',
  };

  let ratesPromise = null;

  async function fetchLiveRates() {
    // Free, keyless endpoint; base USD.
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('Exchange rate service unavailable');
    const data = await res.json();
    if (data.result !== 'success' || !data.rates) throw new Error('Unexpected rate response');
    return data.rates;
  }

  async function getRates() {
    if (ratesPromise) return ratesPromise;

    ratesPromise = (async () => {
      try {
        const cachedRaw = localStorage.getItem(RATE_CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (Date.now() - cached.fetchedAt < RATE_CACHE_TTL_MS) {
            return cached.rates;
          }
        }
      } catch (e) { /* ignore corrupt cache */ }

      try {
        const rates = await fetchLiveRates();
        try {
          localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({ rates, fetchedAt: Date.now() }));
        } catch (e) { /* storage full/unavailable — fine, just won't cache */ }
        window.dispatchEvent(new CustomEvent('fxRatesUpdated', { detail: { live: true } }));
        return rates;
      } catch (err) {
        console.error('Live FX rate fetch failed, falling back to cache/static:', err);
        try {
          const cachedRaw = localStorage.getItem(RATE_CACHE_KEY);
          if (cachedRaw) {
            window.dispatchEvent(new CustomEvent('fxRatesUpdated', { detail: { live: false, stale: true } }));
            return JSON.parse(cachedRaw).rates;
          }
        } catch (e) { /* ignore */ }
        // Last-resort static fallback so the page never breaks
        window.dispatchEvent(new CustomEvent('fxRatesUpdated', { detail: { live: false, stale: true } }));
        return { USD: 1, EUR: 0.92, GBP: 0.79, KES: 129, NGN: 1550, ZAR: 18.3 };
      }
    })();

    return ratesPromise;
  }

  async function getActiveCurrency() {
    try {
      const doc = await window.firebaseDb.collection('settings').doc('config').get();
      if (doc.exists && doc.data().currency) return doc.data().currency;
    } catch (err) {
      console.error('getActiveCurrency error:', err);
    }
    return 'USD';
  }

  async function convert(usdAmount, code) {
    if (usdAmount == null || isNaN(usdAmount)) return null;
    const rates = await getRates();
    const rate = rates[code] ?? 1;
    return usdAmount * rate;
  }

  function format(amount, code) {
    if (amount == null || isNaN(amount)) return '—';
    const symbol = CURRENCY_SYMBOLS[code] || code + ' ';
    return `${symbol} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Live-updates: watch /settings/config so if currency changes in another
  // tab (or Settings page) while Pricing is open, it reconverts instantly.
  function onCurrencyChange(callback) {
    return window.firebaseDb.collection('settings').doc('config')
      .onSnapshot(doc => {
        const currency = (doc.exists && doc.data().currency) ? doc.data().currency : 'USD';
        callback(currency);
      }, err => console.error('onCurrencyChange listener error:', err));
  }

  window.CurrencyHelper = {
    getActiveCurrency,
    getRates,
    convert,
    format,
    onCurrencyChange,
    SYMBOLS: CURRENCY_SYMBOLS,
  };
})();
