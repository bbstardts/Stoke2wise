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
 *   clearAllHistory()       — passkey-gated, chunked batch delete of all
 *                              /transactions + /history docs (admin only)
 *
 * Role checks:
 *   Only show #userManagementSection if currentUser role === 'admin'.
 *
 * TODO: Wire Firebase Auth and Firestore calls once firebase-config.js is ready.
 */

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadWarehouseConfig();
  loadDepartments();
  loadUsers();

  document.getElementById('profileForm').addEventListener('submit',   saveProfile);
  document.getElementById('passwordForm').addEventListener('submit',  changePassword);
  document.getElementById('warehouseForm').addEventListener('submit', saveWarehouseConfig);
  document.getElementById('departmentForm').addEventListener('submit', addDepartment);
  document.getElementById('inviteForm').addEventListener('submit',    sendInvite);
  document.getElementById('passkeyForm').addEventListener('submit',    setClearHistoryPasskey);
  document.getElementById('clearHistoryBtn').addEventListener('click', openClearHistoryModal);
  document.getElementById('clearHistoryCancelBtn').addEventListener('click', closeClearHistoryModal);
  document.getElementById('clearHistoryModalClose').addEventListener('click', closeClearHistoryModal);
  document.getElementById('clearHistoryConfirmBtn').addEventListener('click', clearAllHistory);
  document.getElementById('clearHistoryPasskey').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); clearAllHistory(); }
  });
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

// ── Departments / Cost Centres ────────────────
// Stored as an array on /settings/config so it's read alongside the rest
// of the warehouse config (same doc pattern as warehouseName, grnPrefix, etc.)
const DEFAULT_DEPARTMENTS = ['Poultry', 'Crop', 'Maintenance', 'Admin'];

async function loadDepartments() {
  const tbody = document.getElementById('departmentsBody');
  try {
    const doc = await window.firebaseDb.collection('settings').doc('config').get();
    const depts = (doc.exists && Array.isArray(doc.data().departments) && doc.data().departments.length)
      ? doc.data().departments
      : DEFAULT_DEPARTMENTS;
    renderDepartments(depts);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2" style="color:var(--color-text-muted);text-align:center;padding:20px">Could not load departments.</td></tr>`;
  }
}

function renderDepartments(depts) {
  const tbody = document.getElementById('departmentsBody');
  if (!depts.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="color:var(--color-text-muted);text-align:center;padding:20px">No departments yet — add one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = depts.map(d => `
    <tr>
      <td>${escSettingsHtml(d)}</td>
      <td><button class="btn-ghost" style="font-size:12px" onclick="removeDepartment('${escSettingsHtml(d).replace(/'/g,"\\'")}')">Remove</button></td>
    </tr>`).join('');
}

async function addDepartment(e) {
  e.preventDefault();
  const input = document.getElementById('departmentName');
  const name  = input.value.trim();
  if (!name) return;
  try {
    const ref  = window.firebaseDb.collection('settings').doc('config');
    const doc  = await ref.get();
    const depts = (doc.exists && Array.isArray(doc.data().departments) && doc.data().departments.length)
      ? doc.data().departments
      : DEFAULT_DEPARTMENTS.slice();
    if (depts.some(d => d.toLowerCase() === name.toLowerCase())) {
      alert('That department already exists.');
      return;
    }
    depts.push(name);
    await ref.set({ departments: depts, updatedAt: new Date().toISOString() }, { merge: true });
    input.value = '';
    renderDepartments(depts);
  } catch (err) {
    alert('Failed to add department: ' + err.message);
  }
}

async function removeDepartment(name) {
  if (!confirm(`Remove department "${name}"? Past transactions keep their recorded department.`)) return;
  try {
    const ref  = window.firebaseDb.collection('settings').doc('config');
    const doc  = await ref.get();
    const depts = (doc.exists && Array.isArray(doc.data().departments) && doc.data().departments.length)
      ? doc.data().departments
      : DEFAULT_DEPARTMENTS.slice();
    const updated = depts.filter(d => d !== name);
    await ref.set({ departments: updated, updatedAt: new Date().toISOString() }, { merge: true });
    renderDepartments(updated);
  } catch (err) {
    alert('Failed to remove department: ' + err.message);
  }
}

function escSettingsHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
      const isPending  = u.status === 'pending' || u.approved === false;
      const isInviteOnly = u.status === 'invited'; // placeholder row, no real account yet
      const statusPill = isInviteOnly
        ? `<span class="status-pill" style="background:rgba(37,99,235,0.1);color:var(--color-primary)">Invited</span>`
        : isPending
          ? `<span class="status-pill status-pill--pending">Pending</span>`
          : `<span class="status-pill status-pill--active">Active</span>`;

      const approveBtn = isPending && !isInviteOnly
        ? `<button class="btn-primary" style="margin-right:8px;font-size:12px;padding:6px 12px" onclick="approveUser('${doc.id}')">Approve</button>`
        : '';

      return `<tr>
        <td>${u.displayName || '—'}</td>
        <td>${u.email || '—'} ${statusPill}</td>
        <td>
          <select onchange="changeRole('${doc.id}', this.value)" ${isInviteOnly ? 'disabled' : ''}>
            <option value="viewer"  ${u.role==='viewer'  ? 'selected':''}>Viewer</option>
            <option value="staff"   ${u.role==='staff'   ? 'selected':''}>Staff</option>
            <option value="admin"   ${u.role==='admin'   ? 'selected':''}>Admin</option>
          </select>
        </td>
        <td>
          ${approveBtn}
          <button class="btn-ghost" style="font-size:12px" onclick="removeUser('${doc.id}')">Remove</button>
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

async function approveUser(uid) {
  try {
    const docRef = window.firebaseDb.collection('users').doc(uid);
    const doc = await docRef.get();
    const u = doc.exists ? doc.data() : {};

    await docRef.update({
      approved: true,
      status: 'active',
    });

    notifyUserOfApproval(u.displayName, u.email);

    loadUsers();
  } catch (err) {
    alert('Failed to approve user: ' + err.message);
  }
}

function notifyUserOfApproval(name, email) {
  const cfg = window.NOTIFY_CONFIG;
  if (!cfg || !cfg.enabled || !cfg.approvedTemplateId || cfg.approvedTemplateId.startsWith('YOUR_') || typeof emailjs === 'undefined') return;
  try {
    emailjs.send(cfg.serviceId, cfg.approvedTemplateId, {
      user_name:  name || 'there',
      to_email:   email,
    }, cfg.publicKey).catch((err) => console.warn('User approval email failed:', err));
  } catch (err) {
    console.warn('User approval email failed:', err);
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
// Passkey is stored as a SHA-256 hash on /settings/config (clearHistoryPasskeyHash) —
// never in plaintext. If no passkey has been set yet, the default is "DELETE" so the
// feature works out of the box; admins are encouraged to set their own above.
const DEFAULT_CLEAR_HISTORY_PASSKEY = 'DELETE';

async function sha256Hex(text) {
  const enc  = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function setClearHistoryPasskey(e) {
  e.preventDefault();
  const input = document.getElementById('newClearHistoryPasskey');
  const value = input.value.trim();
  if (value.length < 4) {
    alert('Passkey must be at least 4 characters.');
    return;
  }
  try {
    const hash = await sha256Hex(value);
    await window.firebaseDb.collection('settings').doc('config').set(
      { clearHistoryPasskeyHash: hash, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    input.value = '';
    alert('Passkey updated. You will need it next time you clear history.');
  } catch (err) {
    alert('Failed to set passkey: ' + err.message);
  }
}

function openClearHistoryModal() {
  const modal = document.getElementById('clearHistoryModal');
  const pass  = document.getElementById('clearHistoryPasskey');
  const error = document.getElementById('clearHistoryError');
  pass.value = '';
  error.classList.add('hidden');
  modal.classList.remove('hidden');
  pass.focus();
}

function closeClearHistoryModal() {
  document.getElementById('clearHistoryModal').classList.add('hidden');
}

async function clearAllHistory() {
  const passInput  = document.getElementById('clearHistoryPasskey');
  const errorEl    = document.getElementById('clearHistoryError');
  const confirmBtn = document.getElementById('clearHistoryConfirmBtn');
  const entered    = passInput.value;

  errorEl.classList.add('hidden');
  if (!entered) {
    errorEl.textContent = 'Please enter the passkey.';
    errorEl.classList.remove('hidden');
    return;
  }

  confirmBtn.disabled    = true;
  confirmBtn.textContent = 'Verifying…';

  try {
    // Verify passkey against the stored hash (or the default if none is set yet).
    const cfgDoc = await window.firebaseDb.collection('settings').doc('config').get();
    const storedHash = cfgDoc.exists ? cfgDoc.data().clearHistoryPasskeyHash : null;
    const enteredHash = await sha256Hex(entered);
    const isValid = storedHash ? enteredHash === storedHash : entered === DEFAULT_CLEAR_HISTORY_PASSKEY;

    if (!isValid) {
      errorEl.textContent = 'Incorrect passkey. Please try again.';
      errorEl.classList.remove('hidden');
      confirmBtn.disabled    = false;
      confirmBtn.textContent = 'Delete All History';
      passInput.select();
      return;
    }

    confirmBtn.textContent = 'Deleting…';

    // Gather every doc from both collections that power every "history" view
    // across the app (Dashboard activity feed, Receive/Issue recent lists,
    // Reports, and the History page itself).
    const [txSnap, histSnap] = await Promise.all([
      window.firebaseDb.collection('transactions').get(),
      window.firebaseDb.collection('history').get(),
    ]);
    const allRefs = [...txSnap.docs.map(d => d.ref), ...histSnap.docs.map(d => d.ref)];

    if (allRefs.length === 0) {
      closeClearHistoryModal();
      alert('There is no history to clear — it is already empty.');
      return;
    }

    // Firestore caps a single batch at 500 writes, so delete in safe chunks.
    const CHUNK_SIZE = 450;
    for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
      const chunk = allRefs.slice(i, i + CHUNK_SIZE);
      const batch = window.firebaseDb.batch();
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    closeClearHistoryModal();
    alert(`✓ History cleared — ${allRefs.length} record(s) deleted across all pages.`);
  } catch (err) {
    console.error('clearAllHistory error:', err);
    errorEl.textContent = 'Failed to clear history: ' + err.message;
    errorEl.classList.remove('hidden');
  } finally {
    confirmBtn.disabled    = false;
    confirmBtn.textContent = 'Delete All History';
  }
}
