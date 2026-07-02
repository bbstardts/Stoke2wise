/**
 * products.js
 * ─────────────────────────────────────────────
 * Simplified product management:
 *   Fields: category, name, description, qty (current stock), minLevel (minimum stock level)
 *
 * Removed: SKU, unit, binLocation
 * Firestore collection: /products
 */

const db = window.firebaseDb;

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
  loadProducts();
});

// ── Firestore ─────────────────────────────────────────────────────────────────
function loadProducts() {
  if (unsubscribe) unsubscribe();
  unsubscribe = db.collection('products')
    .orderBy('name')
    .onSnapshot(snap => {
      allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderTable(allProducts);
      updateStats(allProducts);
      populateCategoryFilter(allProducts);
    }, err => {
      console.error('Firestore error:', err);
    });
}

async function saveProductToFirestore(data) {
  const id = document.getElementById('productId').value;
  if (id) {
    data.updatedAt = new Date().toISOString();
    await db.collection('products').doc(id).update(data);
  } else {
    data.createdAt = new Date().toISOString();
    data.updatedAt = data.createdAt;
    await db.collection('products').add(data);
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  try {
    await db.collection('products').doc(id).delete();
  } catch (err) {
    alert('Error deleting product: ' + err.message);
  }
}

// ── Form ──────────────────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  hideFormError();

  const data = {
    category:    document.getElementById('category').value.trim(),
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
  hideFormError();

  if (productId) {
    document.getElementById('modalTitle').textContent = 'Edit Product';
    const p = allProducts.find(x => x.id === productId);
    if (p) {
      document.getElementById('productId').value   = p.id;
      document.getElementById('category').value    = p.category || '';
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
  const cats    = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const current = categoryFilter.value;

  document.getElementById('categoryList').innerHTML =
    cats.map(c => `<option value="${escHtml(c)}"></option>`).join('');

  categoryFilter.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${escHtml(c)}" ${c === current ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showFormError(msg) { formError.textContent = msg; formError.classList.remove('hidden'); }
function hideFormError()    { formError.classList.add('hidden'); formError.textContent = ''; }

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
