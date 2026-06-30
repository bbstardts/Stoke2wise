/**
 * auth-guard.js
 * ─────────────────────────────────────────────
 * Purpose: Protects all pages inside /pages/*.
 *          Redirects to login (../index.html) if no authenticated user.
 *          Sets window.currentUser for other scripts to read.
 *
 * Depends on: firebase-config.js (window.firebaseAuth)
 * Used by:    Every page inside /pages/
 */

(function () {
  const auth = window.firebaseAuth;

  // Show nothing until auth state is confirmed (avoids flicker)
  document.documentElement.style.visibility = 'hidden';

  auth.onAuthStateChanged((user) => {
    if (!user) {
      // Not logged in → send to login page
      window.location.replace('../index.html');
    } else {
      // Logged in → reveal page and expose user globally
      window.currentUser = user;
      document.documentElement.style.visibility = '';
    }
  });
})();
