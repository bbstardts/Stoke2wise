/**
 * firebase-config.js
 * ─────────────────────────────────────────────
 * Purpose: Initialize Firebase app and export core service instances.
 *
 * Services exported as globals:
 *   window.firebaseAuth    — Firebase Authentication instance
 *   window.firebaseDb      — Firestore database instance
 *
 * Offline support:
 *   Firestore's IndexedDB persistence is enabled below. While the device
 *   has no connection, reads are served from the local cache and writes
 *   (batch.commit(), .set(), .update(), etc.) are queued on disk and
 *   automatically replayed against the server the moment connectivity
 *   returns — no extra code needed in grn.js / issue.js / etc.
 *   A small banner (bottom of this file) tells the user when that's
 *   happening, since "it just works silently" is confusing without
 *   any feedback on a warehouse floor with patchy wifi.
 */

const firebaseConfig = {
  apiKey:            "AIzaSyBZjpdSePOE7wJgv9ikuvjIc4XTdXzkPnM",
  authDomain:        "project-warehouse-e6077.firebaseapp.com",
  projectId:         "project-warehouse-e6077",
  storageBucket:     "project-warehouse-e6077.firebasestorage.app",
  messagingSenderId: "921220846259",
  appId:             "1:921220846259:web:19f6e198f8eb1b08c796c6"
};

firebase.initializeApp(firebaseConfig);

window.firebaseAuth    = firebase.auth();
window.firebaseDb      = firebase.firestore();

// ── Offline persistence ─────────────────────────────────────────────
// synchronizeTabs lets the user have two StockWise tabs open (e.g. GRN
// in one, Dashboard in another) and still share a single offline queue.
window.firebaseDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline persistence unavailable: multiple tabs without sync.');
  } else if (err.code === 'unimplemented') {
    console.warn('Offline persistence not supported in this browser.');
  } else {
    console.warn('Offline persistence failed to start:', err);
  }
});

// ── App-shell caching ────────────────────────────────────────────────
// This is what lets the app OPEN with no internet at all, not just keep
// working once a page is already loaded — see sw.js for details.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// ── Connectivity banner ─────────────────────────────────────────────
// Injected as plain DOM/CSS so every page that loads firebase-config.js
// gets it automatically, with no per-page HTML changes required.
(function setupOfflineBanner() {
  function init() {
    const banner = document.createElement('div');
    banner.id = 'connectivity-banner';
    banner.setAttribute('role', 'status');
    Object.assign(banner.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '9999',
      textAlign: 'center', padding: '8px 16px', fontSize: '13px',
      fontFamily: "var(--font-body, 'Inter', system-ui, sans-serif)",
      fontWeight: '600', color: '#fff', transform: 'translateY(-100%)',
      transition: 'transform 0.25s ease', pointerEvents: 'none'
    });
    document.body.prepend(banner);

    let hideTimer = null;

    function showOffline() {
      clearTimeout(hideTimer);
      banner.textContent = "You're offline — changes are being saved and will sync automatically once you're back online.";
      banner.style.background = 'var(--color-warning, #D97706)';
      banner.style.transform = 'translateY(0)';
    }

    function showBackOnline() {
      banner.textContent = '✓ Back online — syncing your changes…';
      banner.style.background = 'var(--color-success, #16A34A)';
      banner.style.transform = 'translateY(0)';
      hideTimer = setTimeout(() => { banner.style.transform = 'translateY(-100%)'; }, 3000);
    }

    window.addEventListener('offline', showOffline);
    window.addEventListener('online', showBackOnline);

    // Show immediately on page load if already offline.
    if (!navigator.onLine) showOffline();
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
