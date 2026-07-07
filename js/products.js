/**
 * products.js
 * ─────────────────────────────────────────────
 * Simplified product management:
 *   Fields: category, name, description, qty (current stock), minLevel (minimum stock level)
 *
 * Removed: SKU, unit, binLocation
 * Firestore collection: /products
 */

const db   = window.firebaseDb;
const auth = () => window.firebaseAuth;

let allProducts = [];
let unsubscribe = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const addBtn         = document.getElementById('addProductBtn');
const closeModalBtn  = document.getElementById('closeModal');
const cancelModalBtn = document.getElementById('cancelModal');
const productModal   = document.getElementById('productModal');
const productForm    = document.getElementById('productForm');
const searchInput    = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const formError      = document.getElementById('formError');
const saveBtnText    = document.getElementById('saveBtnText');
const saveBtnSpinner = document.getElementById('saveBtnSpinner');

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  addBtn.addEventListener('click',         () => openModal());
  closeModalBtn.addEventListener('click',  closeModal);
  cancelModalBtn.addEventListener('click', closeModal);
  searchInput.addEventListener('input',    filterProducts);
  categoryFilter.addEventListener('change', filterProducts);
  productForm.addEventListener('submit',   handleFormSubmit);
  document.getElementById('category').addEventListener('change', handleCategorySelectChange);
  loadProducts();
  loadRecentProductChanges();

  // Re-render once the user's role is confirmed, so viewers never see
  // Edit/Delete buttons flash before the role check is ready.
  document.addEventListener('roleReady', () => renderTable(allProducts));
});

// ── Firestore ─────────────────────────────────────────────────────────────────
function loadProducts() {
  if (unsubscribe) unsubscribe();
  unsubscribe = db.collection('products')
    .orderBy('name')
    .onSnapshot(snap => {
      allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      populateCategoryFilter(allProducts);
      // Re-apply whatever search/category filter is currently active, rather
      // than always rendering the full list — otherwise a live update (e.g.
      // another user editing a product) would silently reset an in-progress
      // search back to showing everything.
      filterProducts();
    }, err => {
      console.error('Firestore error:', err);
    });
}

async function saveProductToFirestore(data) {
  const id = document.getElementById('productId').value;
  const now = new Date().toISOString();
  const user = auth().currentUser;
  const performedBy = user?.email || user?.uid || 'unknown';

  if (id) {
    const before = allProducts.find(p => p.id === id);
    data.updatedAt = now;

    const batch = db.batch();
    batch.update(db.collection('products').doc(id), data);
    logProductHistory(batch, {
      actionType: 'Product Updated',
      category: data.category,
      productName: data.name,
      description: buildUpdateDescription(before, data),
      performedBy,
      createdAt: now,
    });
    await batch.commit();
  } else {
    data.createdAt = now;
    data.updatedAt = now;

    const newRef = db.collection('products').doc();
    const batch = db.batch();
    batch.set(newRef, data);
    logProductHistory(batch, {
      actionType: 'Product Added',
      category: data.category,
      productName: data.name,
      description: `New product added — Category: ${data.category || '—'}, Stock: ${data.qty}, Min Level: ${data.minLevel}`,
      performedBy,
      createdAt: now,
    });
    await batch.commit();
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  try {
    const before = allProducts.find(p => p.id === id);
    const user = auth().currentUser;
    const performedBy = user?.email || user?.uid || 'unknown';
    const now = new Date().toISOString();

    const batch = db.batch();
    batch.delete(db.collection('products').doc(id));
    logProductHistory(batch, {
      actionType: 'Product Removed',
      category: before?.category || '',
      productName: before?.name || '—',
      description: before
        ? `Product removed — was Category: ${before.category || '—'}, Stock: ${before.qty ?? 0}, Min Level: ${before.minLevel ?? 0}`
        : 'Product removed',
      performedBy,
      createdAt: now,
    });
    await batch.commit();
  } catch (err) {
    alert('Error deleting product: ' + err.message);
  }
}

// ── History logging ──────────────────────────────────────────────────────────
// Records every product add/edit/delete to the shared /history Firestore
// collection (same collection GRN, Issue, and Pricing already write to) so
// History shows who changed a product and when. Uses the same batch-write
// pattern as js/pricing.js's logPriceHistory(), so the /products write and
// the /history write commit atomically.
function logProductHistory(batch, { actionType, category, productName, description, performedBy, createdAt }) {
  const h = db.collection('history').doc();
  batch.set(h, {
    actionType, category, productName, description, performedBy, createdAt,
  });
}

// Builds a plain-language "what changed" description for an update,
// comparing the previous product doc to the new form values field by field.
function buildUpdateDescription(before, after) {
  if (!before) return `Product updated — Category: ${after.category || '—'}, Stock: ${after.qty}, Min Level: ${after.minLevel}`;

  const fields = [
    ['category',    'Category'],
    ['name',        'Name'],
    ['description', 'Description'],
    ['qty',         'Stock'],
    ['minLevel',    'Min Level'],
  ];

  const changes = [];
  fields.forEach(([key, label]) => {
    const oldVal = before[key] ?? (key === 'qty' || key === 'minLevel' ? 0 : '');
    const newVal = after[key]  ?? (key === 'qty' || key === 'minLevel' ? 0 : '');
    if (String(oldVal) !== String(newVal)) {
      changes.push(`${label}: ${oldVal || '—'} → ${newVal || '—'}`);
    }
  });

  return changes.length ? changes.join('; ') : 'No field changes detected';
}

// ── Category select / add-new toggle ───────────────────────────────────────────
function handleCategorySelectChange() {
  const select  = document.getElementById('category');
  const newInput = document.getElementById('categoryNew');
  const isNew = select.value === '__new__';
  newInput.classList.toggle('hidden', !isNew);
  newInput.required = isNew;
  if (isNew) newInput.focus();
}

function getSelectedCategory() {
  const select = document.getElementById('category');
  if (select.value === '__new__') {
    return document.getElementById('categoryNew').value;
  }
  return select.value;
}

// Selects `value` in the category dropdown if it exists as an option;
// otherwise falls back to the "Add new category" flow so edits on products
// whose category isn't in the current list (e.g. renamed/deleted elsewhere)
// still show the correct value.
function setSelectedCategory(value) {
  const select = document.getElementById('category');
  const newInput = document.getElementById('categoryNew');
  const hasOption = Array.from(select.options).some(o => o.value === value);

  if (value && !hasOption) {
    select.value = '__new__';
    newInput.value = value;
    newInput.classList.remove('hidden');
    newInput.required = true;
  } else {
    select.value = value;
    newInput.value = '';
    newInput.classList.add('hidden');
    newInput.required = false;
  }
}

// ── Form ──────────────────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  hideFormError();

  const data = {
    category:    normalizeCategory(getSelectedCategory()),
    name:        document.getElementById('productName').value.trim(),
    description: document.getElementById('description').value.trim(),
    qty:         Number(document.getElementById('quantity').value),
    minLevel:    Number(document.getElementById('minLevel').value) || 0,
  };

  setSavingState(true);
  try {
    await saveProductToFirestore(data);
    closeModal();
  } catch (err) {
    showFormError('Error saving product: ' + err.message);
  } finally {
    setSavingState(false);
  }
}

function setSavingState(saving) {
  document.getElementById('saveBtn').disabled = saving;
  saveBtnText.classList.toggle('hidden', saving);
  saveBtnSpinner.classList.toggle('hidden', !saving);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(productId) {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('categoryNew').value = '';
  document.getElementById('categoryNew').classList.add('hidden');
  document.getElementById('categoryNew').required = false;
  hideFormError();

  if (productId) {
    document.getElementById('modalTitle').textContent = 'Edit Product';
    const p = allProducts.find(x => x.id === productId);
    if (p) {
      document.getElementById('productId').value   = p.id;
      setSelectedCategory(p.category || '');
      document.getElementById('productName').value = p.name;
      document.getElementById('description').value = p.description || '';
      document.getElementById('quantity').value    = p.qty ?? 0;
      document.getElementById('minLevel').value    = p.minLevel ?? 0;
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Add Product';
  }

  productModal.classList.remove('hidden');
}

function closeModal() {
  productModal.classList.add('hidden');
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(products) {
  const tbody = document.getElementById('productsBody');
  const empty = document.getElementById('emptyState');

  if (!products.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = products.map(p => {
    const qty        = p.qty ?? 0;
    const minLevel   = p.minLevel ?? 0;
    const isOut      = qty <= 0;
    const isLow      = !isOut && minLevel > 0 && qty <= minLevel;
    const badgeClass = isOut ? 'stock-badge--empty' : (isLow ? 'stock-badge--low' : 'stock-badge--ok');
    const desc       = p.description || '';
    const canEdit    = window.currentUserRole !== 'viewer';
    const actionsCell = canEdit
      ? `<div class="action-btns">
            <button class="action-btn" onclick="openModal('${p.id}')">Edit</button>
            <button class="action-btn action-btn--danger" onclick="deleteProduct('${p.id}')">Delete</button>
          </div>`
      : `<span style="color:var(--color-text-muted);font-size:12px">View only</span>`;

    return `
      <tr>
        <td><span class="cat-badge">${escHtml(p.category || '—')}</span></td>
        <td class="td-name">${escHtml(p.name)}</td>
        <td class="td-desc">${desc ? `<span title="${escHtml(desc)}">${escHtml(desc.slice(0,60))}${desc.length > 60 ? '…' : ''}</span>` : '—'}</td>
        <td><span class="stock-badge ${badgeClass}">${qty}</span></td>
        <td class="cell-muted">${minLevel}</td>
        <td>${actionsCell}</td>
      </tr>`;
  }).join('');
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats(products) {
  const total   = products.length;
  const out     = products.filter(p => (p.qty ?? 0) <= 0).length;
  const low     = products.filter(p => {
    const qty = p.qty ?? 0, min = p.minLevel ?? 0;
    return qty > 0 && min > 0 && qty <= min;
  }).length;
  const inStock = total - out;

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statInStock').textContent = inStock;
  document.getElementById('statOut').textContent     = out;
  document.getElementById('statLow').textContent     = low;
}

// ── Filter ────────────────────────────────────────────────────────────────────
function filterProducts() {
  const query = searchInput.value.toLowerCase();
  const cat   = categoryFilter.value;
  const filtered = allProducts.filter(p =>
    (!query || p.name.toLowerCase().includes(query) ||
               (p.category || '').toLowerCase().includes(query) ||
               (p.description || '').toLowerCase().includes(query)) &&
    (!cat   || p.category === cat)
  );
  renderTable(filtered);
  updateStats(filtered);
}

function populateCategoryFilter(products) {
  const cats    = getDistinctCategories(products);
  const current = categoryFilter.value;

  const categorySelect = document.getElementById('category');
  const prevSelected = categorySelect.value;
  categorySelect.innerHTML =
    '<option value="">— Select category —</option>' +
    cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('') +
    '<option value="__new__">➕ Add new category…</option>';
  if (cats.includes(prevSelected)) categorySelect.value = prevSelected;

  categoryFilter.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${escHtml(c)}" ${c === current ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
}

// Returns the distinct set of categories currently in use, de-duplicated by
// case and surrounding whitespace (e.g. "Tractor" and "tractor " collapse to
// one entry, using the earliest/first-seen casing). This is the same list
// Issue and GRN read via /products, so it stays the single source of truth.
function getDistinctCategories(products) {
  const seen = new Map(); // lowercase-trimmed key -> display value (first seen wins)
  products.forEach(p => {
    const raw = (p.category || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, raw);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// Trims and collapses internal whitespace on a typed category, and if it
// matches an existing category case-insensitively, snaps to that category's
// existing casing instead of creating a near-duplicate.
function normalizeCategory(raw) {
  const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const match = allProducts
    .map(p => (p.category || '').trim())
    .find(c => c.toLowerCase() === cleaned.toLowerCase());
  return match || cleaned;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showFormError(msg) { formError.textContent = msg; formError.classList.remove('hidden'); }
function hideFormError()    { formError.classList.add('hidden'); formError.textContent = ''; }

// ── Recent Product Changes (audit trail) ─────────────────────────────────────
// Reads the same /history collection GRN/Issue/Pricing write to, filtered to
// product-related entries, so staff/admins can see who added, edited, or
// removed a product. Mirrors js/pricing.js's loadRecentPriceChanges().
let unsubProductHistory = null;

function loadRecentProductChanges() {
  const tbody = document.getElementById('recentProductChangesBody');
  if (!tbody) return;
  if (unsubProductHistory) unsubProductHistory();

  unsubProductHistory = db.collection('history')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot(snap => {
      const rows = snap.docs
        .map(d => d.data())
        .filter(d => ['Product Added', 'Product Updated', 'Product Removed'].includes(d.actionType))
        .slice(0, 50);
      renderRecentProductChanges(rows);
    }, err => {
      console.error('product history onSnapshot error:', err);
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Could not load product history.</td></tr>`;
    });
}

function renderRecentProductChanges(rows) {
  const tbody = document.getElementById('recentProductChangesBody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No product changes yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleString(undefined,
      { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const badgeClass = r.actionType === 'Product Removed' ? 'tx-badge--stockout'
      : (r.actionType === 'Product Added' ? 'tx-badge--in' : 'tx-badge--neutral');
    return `<tr>
      <td class="date-cell">${dateStr}</td>
      <td>${escHtml(r.category || '—')}</td>
      <td class="product-cell">${escHtml(r.productName || '—')}</td>
      <td><span class="tx-badge ${badgeClass}">${escHtml(r.description || r.actionType || '—')}</span></td>
      <td>${escHtml(r.performedBy || '—')}</td>
    </tr>`;
  }).join('');
}

// ── Print Report ──────────────────────────────────────────────────────────────
function printCurrentReport() {
  if (!allProducts.length) {
    alert('No products loaded yet — please wait a moment and try again.');
    return;
  }
  const query = searchInput.value.toLowerCase().trim();
  const cat   = categoryFilter.value;
  let visible = allProducts.filter(p =>
    (!query || p.name.toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query)) &&
    (!cat   || p.category === cat)
  );
  const filterDesc = [cat ? `Category: ${cat}` : '', query ? `Search: "${query}"` : ''].filter(Boolean).join(' · ');
  const title = filterDesc ? 'Product Stock Report (Filtered)' : 'Product Stock Report';
  const stats = {
    total:   visible.length,
    out:     visible.filter(p => (p.qty ?? 0) <= 0).length,
    inStock: visible.filter(p => (p.qty ?? 0) > 0).length,
    low:     visible.filter(p => (p.qty ?? 0) > 0 && (p.minLevel ?? 0) > 0 && (p.qty ?? 0) <= (p.minLevel ?? 0)).length,
  };
  if (window.printProductReport) {
    window.printProductReport(visible, { title, filterDesc, stats });
  }
}
