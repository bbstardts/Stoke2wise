/**
 * auth-guard.js
 * ─────────────────────────────────────────────
 * Purpose: Protects all pages inside /pages/*.
 *          Redirects to login (../index.html) if no authenticated user,
 *          OR if the user's account has not yet been approved by an admin.
 *          Sets window.currentUser and window.currentUserRole for other
 *          scripts to read, and adds a `role-xxx` class to <body> so CSS
 *          can hide/disable controls per role (see role-gate.js).
 *
 * Roles:
 *   viewer — read-only, no add/edit/delete/approve anywhere
 *   staff  — can add & edit stock (products, GRN, issue), no admin actions
 *   admin  — full access, including Team Members (approve/remove/roles)
 *
 * Depends on: firebase-config.js (window.firebaseAuth, window.firebaseDb)
 * Used by:    Every page inside /pages/
 */

(function () {
  const auth = window.firebaseAuth;
  const db   = window.firebaseDb;

  // Show nothing until auth state is confirmed (avoids flicker)
  document.documentElement.style.visibility = 'hidden';

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.replace('../index.html');
      return;
    }

    let role = 'staff'; // sensible default for legacy accounts with no /users doc

    try {
      if (db) {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
          const data = doc.data();
          if (data.approved === false) {
            await auth.signOut();
            window.location.replace('../index.html?pending=1');
            return;
          }
          if (data.role) role = data.role;
        }
      }
    } catch (err) {
      console.warn('Approval/role check skipped:', err.message);
    }

    window.currentUser     = user;
    window.currentUserRole = role;
    document.body.classList.add('role-' + role);

    window.currentUserRole = role;
    document.documentElement.style.visibility = '';

    // Let role-gate.js (if loaded) apply restrictions now that the role is known
    document.dispatchEvent(new CustomEvent('roleReady', { detail: { role } }));
  });
})();
