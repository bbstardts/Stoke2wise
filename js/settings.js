/**
 * settings.js
 * ─────────────────────────────────────────────
 * Purpose: Handles all settings page interactions:
 *          profile update, password change, warehouse
 *          configuration, user management, and danger-zone actions.
 *
 * Depends on: firebase-config.js (auth, db), auth-guard.js
 * Used by:    pages/settings.html
 *
 * Firestore reads/writes:
 *   /settings           — single "config" doc (warehouseName, currency, etc.)
 *   /users              — list of team members + roles
 *
 * Firebase Auth calls:
 *   auth.currentUser.updateProfile()   — display name
 *   auth.currentUser.updatePassword()  — password change
 *
 * Functions:
 *   loadProfile()           — prefill profile form from currentUser
 *   saveProfile(e)          — update displayName via Firebase Auth
 *   changePassword(e)       — validate + update password
 *   loadWarehouseConfig()   — read /settings/config from Firestore
 *   saveWarehouseConfig(e)  — write /settings/config to Firestore
 *   loadUsers()             — read /users collection, render table
 *   sendInvite(e)           — write a /users doc with status:"invited"
 *   changeRole(uid, role)   — update role field on a /users doc
 *   removeUser(uid)         — delete a /users doc
 *   clearAllHistory()       — batch delete all /transactions docs (admin only)
 *
 * Role checks:
 *   Only show #userManagementSection if currentUser role === 'admin'.
 *
 * TODO: Wire Firebase Auth and Firestore calls once firebase-config.js is ready.
 */

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadWarehouseConfig();
  loadUsers();

  document.getElementById('profileForm').addEventListener('submit',   saveProfile);
  document.getElementById('passwordForm').addEventListener('submit',  changePassword);
  document.getElementById('warehouseForm').addEventListener('submit', saveWarehouseConfig);
  document.getElementById('inviteForm').addEventListener('submit',    sendInvite);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearAllHistory);
});

// ── Profile ──────────────────────────────────
function loadProfile() {
  const user = window.currentUser;
  if (!user) return;
  document.getElementById('displayName').value = user.displayName || '';
  document.getElementById('userEmail').value   = user.email || '';
}

async function saveProfile(e) {
  e.preventDefault();
  const name = document.getElementById('displayName').value.trim();
  try {
    await window.firebaseAuth.currentUser.updateProfile({ displayName: name });
    alert('Profile updated.');
  } catch (err) {
    alert('Failed to update profile: ' + err.message);
  }
}

// ── Password ─────────────────────────────────
async function changePassword(e) {
  e.preventDefault();
  const currentPw = document.getElementById('currentPassword').value;
  const pw1 = document.getElementById('newPassword').value;
  const pw2 = document.getElementById('confirmPassword').value;
  if (!currentPw)      { alert('Please enter your current password.'); return; }
  if (pw1 !== pw2)     { alert('Passwords do not match.');             return; }
  if (pw1.length < 8)  { alert('Password must be 8+ characters.');    return; }
  try {
    // Re-authenticate first to satisfy Firebase security requirement
    const user       = window.firebaseAuth.currentUser;
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(pw1);
    alert('Password changed successfully.');
    document.getElementById('passwordForm').reset();
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      alert('Current password is incorrect.');
    } else {
      alert('Failed to change password: ' + err.message);
    }
  }
}

// ── Warehouse Config ──────────────────────────
async function loadWarehouseConfig() {
  try {
    const doc = await window.firebaseDb.collection('settings').doc('config').get();
    if (doc.exists) {
      const d = doc.data();
      if (d.warehouseName)   document.getElementById('warehouseName').value   = d.warehouseName;
      if (d.currency)        document.getElementById('currency').value         = d.currency;
      if (d.lowStockDefault != null) document.getElementById('lowStockDefault').value = d.lowStockDefault;
      if (d.grnPrefix)       document.getElementById('grnPrefix').value        = d.grnPrefix;
    }
  } catch (err) {
    console.error('loadWarehouseConfig error:', err);
  }
}

async function saveWarehouseConfig(e) {
  e.preventDefault();
  const config = {
    warehouseName:   document.getElementById('warehouseName').value.trim(),
    currency:        document.getElementById('currency').value,
    lowStockDefault: Number(document.getElementById('lowStockDefault').value),
    grnPrefix:       document.getElementById('grnPrefix').value.trim(),
    updatedAt:       new Date().toISOString(),
  };
  try {
    await window.firebaseDb.collection('settings').doc('config').set(config, { merge: true });
    alert('Configuration saved.');
  } catch (err) {
    alert('Failed to save configuration: ' + err.message);
  }
}

// ── Users ────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('usersBody');
  try {
    const snap = await window.firebaseDb.collection('users').get();
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:var(--color-text-muted);text-align:center;padding:20px">No team members found.</td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(doc => {
      const u = doc.data();
      return `<tr>
        <td>${u.displayName || '—'}</td>
        <td>${u.email || '—'}</td>
        <td>${u.role || '—'}</td>
        <td>
          <select onchange="changeRole('${doc.id}', this.value)">
            <option value="viewer"  ${u.role==='viewer'  ? 'selected':''}>Viewer</option>
            <option value="staff"   ${u.role==='staff'   ? 'selected':''}>Staff</option>
            <option value="admin"   ${u.role==='admin'   ? 'selected':''}>Admin</option>
          </select>
          <button class="btn-ghost" style="margin-left:8px;font-size:12px" onclick="removeUser('${doc.id}')">Remove</button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--color-text-muted);text-align:center;padding:20px">Connect Firebase to manage team members.</td></tr>`;
  }
}

async function sendInvite(e) {
  e.preventDefault();
  const email = document.getElementById('inviteEmail').value.trim();
  const role  = document.getElementById('inviteRole').value;
  try {
    await window.firebaseDb.collection('users').add({
      email,
      role,
      status: 'invited',
      invitedAt: new Date().toISOString(),
    });
    alert(`Invite recorded for ${email}.`);
    document.getElementById('inviteForm').reset();
    loadUsers();
  } catch (err) {
    alert('Failed to send invite: ' + err.message);
  }
}

async function changeRole(uid, role) {
  try {
    await window.firebaseDb.collection('users').doc(uid).update({ role });
  } catch (err) {
    alert('Failed to update role: ' + err.message);
  }
}

async function removeUser(uid) {
  if (!confirm('Remove this team member?')) return;
  try {
    await window.firebaseDb.collection('users').doc(uid).delete();
    loadUsers();
  } catch (err) {
    alert('Failed to remove user: ' + err.message);
  }
}

// ── Danger Zone ───────────────────────────────
async function clearAllHistory() {
  const input = prompt(
    'This will permanently delete ALL transaction history.\n' +
    'Product quantities will NOT be affected.\n\n' +
    'Type DELETE to confirm:'
  );
  if (input !== 'DELETE') return;
  try {
    const snap  = await window.firebaseDb.collection('transactions').get();
    const histSnap = await window.firebaseDb.collection('history').get();
    const batch = window.firebaseDb.batch();
    snap.docs.forEach(d  => batch.delete(d.ref));
    histSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    alert('History cleared.');
  } catch (err) {
    alert('Failed to clear history: ' + err.message);
  }
}
