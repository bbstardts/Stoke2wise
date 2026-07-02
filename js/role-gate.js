/**
 * role-gate.js
 * ─────────────────────────────────────────────
 * Purpose: Enforces role-based permissions on the UI.
 *
 *   viewer — read-only everywhere, can only watch
 *   staff  — can add/edit stock (products, GRN, issue)
 *   admin  — full access, including Team Members & Danger Zone
 *
 * Usage: add `data-min-role="staff"` or `data-min-role="admin"` to any
 * element that should be hidden from lower roles. This script runs once
 * the role is known (after auth-guard.js fires the `roleReady` event).
 *
 * Depends on: auth-guard.js (sets window.currentUserRole, fires 'roleReady')
 * Used by:    pages/products.html, pages/issue.html, pages/grn.html, pages/settings.html
 */

(function () {
  const RANK = { viewer: 0, staff: 1, admin: 2 };

  function applyRoleGate(role) {
    const myRank = RANK[role] ?? 0;
    document.querySelectorAll('[data-min-role]').forEach((el) => {
      const required = RANK[el.getAttribute('data-min-role')] ?? 0;
      if (myRank < required) {
        el.style.display = 'none';
      }
    });

    // Viewers also can't submit any form they can still see (defense in depth,
    // in case a page hasn't tagged every individual control yet)
    if (role === 'viewer') {
      document.querySelectorAll('[data-min-role] input, [data-min-role] select, [data-min-role] textarea')
        .forEach((el) => { el.disabled = true; });
    }
  }

  if (window.currentUserRole) {
    applyRoleGate(window.currentUserRole);
  } else {
    document.addEventListener('roleReady', (e) => applyRoleGate(e.detail.role));
  }
})();
