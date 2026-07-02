/**
 * suppliers.js
 * ─────────────────────────────────────────────
 * Supplier management: name, contact person, phone.
 * Firestore collection: /suppliers
 *
 * Consumed by grn.js (supplier select dropdown on the GRN form).
 */

const db = window.firebaseDb;

let allSuppliers = [];
let unsubscribe  = null;

// ── DOM refs ──────────────────────────────────────────────────────────────
const addBtn          = document.getElementById('addSupplierBtn');
const closeModalBtn   = document.getElementById('closeModal');
const cancelModalBtn  = document.getElementById('cancelModal');
const supplierModal   = document.getElementById('supplierModal');
const supplierForm    = document.getElementById('supplierForm');
const searchInput     = document.getElementById('searchInput');
const formError       = document.getElementById('formError');
const saveBtnText     = document.getElementById('saveBtnText');
const saveBtnSpinner  = document.getElementById('saveBtnSpinner');

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  addBtn.addEventListener('click',         () => openModal());
  closeModalBtn.addEventListener('click',  closeModal);
  cancelModalBtn.addEventListener('click', closeModal);
  searchInput.addEventListener('input',    filterSuppliers);
  supplierForm.addEventListener('submit',  handleFormSubmit);
  loadSuppliers();

  // Re-render once the user's role is confirmed, so viewers never see
  // Edit/Delete buttons flash before the role check is ready.
  document.addEventListener('roleReady', () => renderTable(allSuppliers));
});

// ── Firestore ─────────────────────────────────────────────────────────────
function loadSuppliers() {
  if (unsubscribe) unsubscribe();
  unsubscribe = db.collection('suppliers')
    .orderBy('name')
    .onSnapshot(snap => {
      allSuppliers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderTable(allSuppliers);
    }, err => {
      console.error('Firestore error:', err);
    });
}

async function saveSupplierToFirestore(data) {
  const id = document.getElementById('supplierId').value;
  if (id) {
    data.updatedAt = new Date().toISOString();
    await db.collection('suppliers').doc(id).update(data);
  } else {
    data.createdAt = new Date().toISOString();
    data.updatedAt = data.createdAt;
    await db.collection('suppliers').add(data);
  }
}

async function deleteSupplier(id) {
  if (!confirm('Delete this supplier? This cannot be undone.')) return;
  try {
    await db.collection('suppliers').doc(id).delete();
  } catch (err) {
    alert('Error deleting supplier: ' + err.message);
  }
}

// ── Form ──────────────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  hideFormError();

  const data = {
    name:          document.getElementById('supplierName').value.trim(),
    contactPerson: document.getElementById('contactPerson').value.trim(),
    phone:         document.getElementById('phone').value.trim(),
  };

  if (!data.name) {
    showFormError('Supplier name is required.');
    return;
  }

  setSavingState(true);
  try {
    await saveSupplierToFirestore(data);
    closeModal();
  } catch (err) {
    showFormError('Error saving supplier: ' + err.message);
  } finally {
    setSavingState(false);
  }
}

function setSavingState(saving) {
  document.getElementById('saveBtn').disabled = saving;
  saveBtnText.classList.toggle('hidden', saving);
  saveBtnSpinner.classList.toggle('hidden', !saving);
}

// ── Modal ─────────────────────────────────────────────────────────────────
function openModal(supplierId) {
  document.getElementById('supplierForm').reset();
  document.getElementById('supplierId').value = '';
  hideFormError();

  if (supplierId) {
    document.getElementById('modalTitle').textContent = 'Edit Supplier';
    const s = allSuppliers.find(x => x.id === supplierId);
    if (s) {
      document.getElementById('supplierId').value     = s.id;
      document.getElementById('supplierName').value   = s.name || '';
      document.getElementById('contactPerson').value  = s.contactPerson || '';
      document.getElementById('phone').value          = s.phone || '';
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Add Supplier';
  }

  supplierModal.classList.remove('hidden');
}

function closeModal() {
  supplierModal.classList.add('hidden');
}

// ── Table ─────────────────────────────────────────────────────────────────
function renderTable(suppliers) {
  const tbody = document.getElementById('suppliersBody');
  const empty = document.getElementById('emptyState');

  if (!suppliers.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = suppliers.map(s => {
    const canEdit = window.currentUserRole !== 'viewer';
    const actionsCell = canEdit
      ? `<div class="action-btns">
            <button class="action-btn" onclick="openModal('${s.id}')">Edit</button>
            <button class="action-btn action-btn--danger" onclick="deleteSupplier('${s.id}')">Delete</button>
          </div>`
      : `<span style="color:var(--color-text-muted);font-size:12px">View only</span>`;

    return `
      <tr>
        <td class="td-name">${escHtml(s.name || '—')}</td>
        <td>${escHtml(s.contactPerson || '—')}</td>
        <td>${escHtml(s.phone || '—')}</td>
        <td>${actionsCell}</td>
      </tr>`;
  }).join('');
}

// ── Filter ────────────────────────────────────────────────────────────────
function filterSuppliers() {
  const query = searchInput.value.toLowerCase();
  const filtered = allSuppliers.filter(s =>
    !query ||
    (s.name || '').toLowerCase().includes(query) ||
    (s.contactPerson || '').toLowerCase().includes(query)
  );
  renderTable(filtered);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showFormError(msg) { formError.textContent = msg; formError.classList.remove('hidden'); }
function hideFormError()    { formError.classList.add('hidden'); formError.textContent = ''; }
