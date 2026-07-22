/**
 * sw.js — StockWise app-shell service worker
 * ─────────────────────────────────────────────
 * Purpose: Let the app OPEN with zero internet connection, not just keep
 * running once it's already open. Firestore's own offline persistence
 * (enabled in js/firebase-config.js) only handles DATA — it assumes the
 * HTML/CSS/JS files are already loaded in the tab. This file caches those
 * actual page files, so a cold tap on the app icon / URL works the same
 * offline as it does online.
 *
 * Bump CACHE_VERSION whenever you deploy changes to any cached file, so
 * returning users get the new version instead of a stale cached one.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `stockwise-shell-${CACHE_VERSION}`;

// Every local page/style/script StockWise needs to run.
const LOCAL_URLS = [
  '/', '/index.html', '/register.html',
  '/css/dashboard.css', '/css/expenses.css', '/css/forms.css', '/css/global.css',
  '/css/history.css', '/css/layout.css', '/css/login.css', '/css/pricing.css',
  '/css/products.css', '/css/reports.css', '/css/searchable-select.css', '/css/settings.css',
  '/js/auth-guard.js', '/js/auth.js', '/js/currency.js', '/js/dashboard.js',
  '/js/expenses.js', '/js/firebase-config.js', '/js/grn.js', '/js/history.js',
  '/js/issue.js', '/js/notify-config.js', '/js/pricing.js', '/js/print.js',
  '/js/products.js', '/js/reports.js', '/js/role-gate.js', '/js/searchable-select.js',
  '/js/settings.js', '/js/sidebar.js', '/js/suppliers.js',
  '/pages/dashboard.html', '/pages/expenses.html', '/pages/grn.html', '/pages/history.html',
  '/pages/issue.html', '/pages/pricing.html', '/pages/products.html', '/pages/reports.html',
  '/pages/settings.html', '/pages/suppliers.html',
  '/assets/favicon.ico', '/assets/favicon.svg', '/assets/favicon-32.png', '/assets/apple-touch-icon.png',
  '/assets/icon-192.png', '/assets/icon-512.png', '/manifest.json'
];

// Third-party scripts the app needs before firebase-config.js can even run.
// These are version-pinned URLs, so caching them forever is safe.
const CDN_URLS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
  'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_URLS);
    // CDN scripts fetched one at a time with cors mode; don't let one
    // failure (e.g. a dropped connection mid-install) block the rest.
    await Promise.all(CDN_URLS.map(async url => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) await cache.put(url, res);
      } catch (_) { /* will just be fetched from network next time it's online */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept Firebase/Firestore/Auth API traffic — that's already
  // handled by Firestore's own offline queue, and interfering here would
  // fight with it instead of helping.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('firebaseio.com')) {
    return;
  }

  // Page navigations: try the network first (so users online get the
  // latest version), fall back to the cached shell copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req)) || (await cache.match(new URL(req.url).pathname))
          || (await cache.match('/index.html'));
      }
    })());
    return;
  }

  // Everything else local or pinned-CDN: cache-first, refresh in the
  // background when online so updates still arrive eventually.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
