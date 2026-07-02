/**
 * pricing.js
 * ─────────────────────────────────────────────
 * Purpose: Dedicated Pricing page. This is the ONLY page in the app
 *          that reads or writes product price data.
 *
 * Data model:
 *   Prices are stored in a separate Firestore collection: /prices
 *   Each doc: { productId (optional link to /products), category,
 *               name, priceUSD, updatedAt, createdAt }
 *   - If linked to an existing /products doc (productId set), name/category
 *     stay in sync for display but the /products doc itself is never
 *     written to by this page — price never leaks into Products, GRN,
 *     Issue, or History.
 *   - If not linked (a price-only entry for a name typed here), it's a
 *     standalone /prices doc.
 *
 * Currency: all prices stored in USD (priceUSD). Display currency comes
 * from /settings/config (currency field), same doc Settings already
 * manages. Conversion + live rates handled by currency.js.
 */

const pdb  = window.firebaseDb;
const auth = () => window.firebaseAuth;

let allProducts   = [];   // from /products, for the "existing product" dropdown + name/category lookup
let allPrices     = [];   // from /prices
let merged        = [];   // combined rows: every priced item + unpriced products
let activeCurrency = 'USD';
let currentPage   = 1;
const PAGE_SIZE   = 20;

let unsubPrices   = null;
let unsubProducts = null;

// ── DOM refs ──────────────────────────────────────────────────────────
const addBtn          = document.getElementById('addPriceBtn');
const closeModalBtn   = document.getElementById('closeModal');
const cancelModalBtn  = document.getElementById('cancelModal');
const priceModal      = document.getElementById('priceModal');
const priceForm       = document.getElementById('priceForm');
const searchInput     = document.getElementById('searchInput');
const categoryFilter  = document.getElementById('categoryFilter');
const sortSelect      = document.getElementById('sortSelect');
const formError       = document.getElementById('formError');
const saveBtnText     = document.getElementById('saveBtnText');
const saveBtnSpinner  = document.getElementById('saveBtnSpinner');
const existingSelect  = document.getElementById('existingProductSelect');
const priceUSDInput   = document.getElementById('priceUSD');
const pricePreview    = document.getElementById('pricePreview');
const previewLabel    = document.getElementById('previewCurrencyLabel');
const rateStatus      = document.getElementById('rateStatus');
const prevPageBtn     = document.getElementById('prevPageBtn');
const nextPageBtn     = document.getElementById('nextPageBtn');
const pageIndicator   = document.getElementById('pageIndicator');

// ── Init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  addBtn.addEventListener('click',          () => openModal());
  closeModalBtn.addEventListener('click',   closeModal);
  cancelModalBtn.addEventListener('click',  closeModal);
  searchInput.addEventListener('input',     () => { currentPage = 1; renderCurrentView(); });
  categoryFilter.addEventListener('change', () => { currentPage = 1; renderCurrentView(); });
  sortSelect.addEventListener('change',     renderCurrentView);
  priceForm.addEventListener('submit',      handleFormSubmit);
  existingSelect.addEventListener('change', handleExistingProductPick);
  priceUSDInput.addEventListener('input',   updatePreview);
  prevPageBtn.addEventListener('click',     () => { if (currentPage > 1) { currentPage--; renderCurrentView(); } });
  nextPageBtn.addEventListener('click',     () => { currentPage++; renderCurrentView(); });

  window.addEventListener('fxRatesUpdated', (e) => {
    rateStatus.textContent = e.detail.live ? 'Rates up to date' : 'Showing last known rates';
    rateStatus.classList.toggle('rate-status--stale', !e.detail.live);
    renderCurrentView();
  });

  window.CurrencyHelper.onCurrencyChange((currency) => {
    activeCurrency = currency;
    document.getElementById('statCurrency').textContent = currency;
    previewLabel.textContent = currency;
    renderCurrentView();
  });

  loadProducts();
  loadPrices();
  loadRecentPriceChanges();

  // Re-render once the user's role is confirmed, so viewers never see
  // Edit/Set Price buttons flash before the role check is ready.
  document.addEventListener('roleReady', renderCurrentView);
});

// ── Firestore: load ──────────────────────────────────────────────────
function loadProducts() {
  if (unsubProducts) unsubProducts();
  unsubProducts = pdb.collection('products').orderBy('name').onSnapshot(snap => {
    allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    populateExistingProductSelect();
    rebuildMergedView();
  }, err => console.error('products listener error:', err));
}

function loadPrices() {
  if (unsubPrices) unsubPrices();
  unsubPrices = pdb.collection('prices').onSnapshot(snap => {
    allPrices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    rebuildMergedView();
  }, err => console.error('prices listener error:', err));
}

// Combine: every priced entry, plus any /products not yet priced (shown as "Unpriced")
function rebuildMergedView() {
  const pricedByProductId = new Map(allPrices.filter(p => p.productId).map(p => [p.productId, p]));
  const standalonePrices  = allPrices.filter(p => !p.productId);

  const fromProducts = allProducts.map(prod => {
    const priceDoc = pricedByProductId.get(prod.id);
    return {
      rowId:     priceDoc ? priceDoc.id : `unpriced-${prod.id}`,
      priceDocId: priceDoc ? priceDoc.id : null,
      productId: prod.id,
      category:  prod.category || '—',
      name:      prod.name,
      qty:       prod.qty ?? 0,
      priceUSD:  priceDoc ? priceDoc.priceUSD : null,
    };
  });

  const fromStandalone = standalonePrices.map(p => ({
    rowId:      p.id,
    priceDocId: p.id,
    productId:  null,
    category:   p.category || '—',
    name:       p.name,
    qty:        null, // not tracked in Products, so no stock qty available
    priceUSD:   p.priceUSD,
  }));

  merged = [...fromProducts, ...fromStandalone];
  populateCategoryFilter();
  renderCurrentView();
}

// ── Render pipeline ──────────────────────────────────────────────────
async function renderCurrentView() {
  const query = searchInput.value.toLowerCase().trim();
  const cat   = categoryFilter.value;
  const sort  = sortSelect.value;

  let rows = merged.filter(r =>
    (!query || r.name.toLowerCase().includes(query) || r.category.toLowerCase().includes(query)) &&
    (!cat   || r.category === cat)
  );

  rows.sort((a, b) => {
    if (sort === 'name-asc')  return a.name.localeCompare(b.name);
    if (sort === 'name-desc') return b.name.localeCompare(a.name);
    const av = a.priceUSD ?? -1, bv = b.priceUSD ?? -1;
    if (sort === 'price-asc')  return av - bv;
    if (sort === 'price-desc') return bv - av;
    return 0;
  });

  activeCurrency = await window.CurrencyHelper.getActiveCurrency();
  document.getElementById('statCurrency').textContent = activeCurrency;
  previewLabel.textContent = activeCurrency;

  await renderTable(rows);
  await updateStats(rows);
  updatePreview();
}

async function renderTable(rows) {
  const tbody = document.getElementById('pricingBody');
  const empty = document.getElementById('emptyState');
  const paginationBar = document.getElementById('paginationBar');

  if (!rows.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    paginationBar.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  paginationBar.classList.toggle('hidden', totalPages <= 1);
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;

  const canEdit = window.currentUserRole !== 'viewer';

  const rendered = await Promise.all(pageRows.map(async (r) => {
    const hasPrice = r.priceUSD != null;
    const converted = hasPrice ? await window.CurrencyHelper.convert(r.priceUSD, activeCurrency) : null;
    const priceCell = hasPrice
      ? `<span class="price-badge">${window.CurrencyHelper.format(converted, activeCurrency)}</span>`
      : `<span class="price-badge price-badge--unset">Not set</span>`;

    const totalValue = (hasPrice && r.qty != null)
      ? window.CurrencyHelper.format(converted * r.qty, activeCurrency)
      : '—';

    const actionsCell = canEdit
      ? `<div class="action-btns">
           <button class="action-btn" onclick="openModal('${r.rowId}')">${hasPrice ? 'Edit' : 'Set Price'}</button>
           ${r.priceDocId ? `<button class="action-btn action-btn--danger" onclick="deletePrice('${r.priceDocId}')">Delete</button>` : ''}
         </div>`
      : `<span style="color:var(--color-text-muted);font-size:12px">View only</span>`;

    return `
      <tr>
        <td><span class="cat-badge">${escPHtml(r.category)}</span></td>
        <td class="td-name">${escPHtml(r.name)}</td>
        <td class="cell-muted">${r.qty != null ? r.qty : '—'}</td>
        <td>${priceCell}</td>
        <td class="cell-muted">${totalValue}</td>
        <td>${actionsCell}</td>
      </tr>`;
  }));

  tbody.innerHTML = rendered.join('');
}

async function updateStats(rows) {
  const priced   = rows.filter(r => r.priceUSD != null).length;
  const unpriced = rows.length - priced;

  let totalUSD = 0;
  rows.forEach(r => {
    if (r.priceUSD != null && r.qty != null) totalUSD += r.priceUSD * r.qty;
  });
  const converted = await window.CurrencyHelper.convert(totalUSD, activeCurrency);

  document.getElementById('statPriced').textContent     = priced;
  document.getElementById('statUnpriced').textContent   = unpriced;
  document.getElementById('statTotalValue').textContent = window.CurrencyHelper.format(converted, activeCurrency);
}

// ── Category filter / datalist ──────────────────────────────────────
function populateCategoryFilter() {
  const cats = [...new Set(merged.map(r => r.category).filter(c => c && c !== '—'))].sort();
  const current = categoryFilter.value;

  document.getElementById('categoryList').innerHTML =
    cats.map(c => `<option value="${escPHtml(c)}"></option>`).join('');

  categoryFilter.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${escPHtml(c)}" ${c === current ? 'selected' : ''}>${escPHtml(c)}</option>`).join('');
}

function populateExistingProductSelect() {
  const current = existingSelect.value;
  existingSelect.innerHTML = '<option value="">— Type a new product name below instead —</option>' +
    allProducts.map(p => `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${escPHtml(p.name)} (${escPHtml(p.category || 'Uncategorized')})</option>`).join('');
}

function handleExistingProductPick() {
  const id = existingSelect.value;
  if (!id) return;
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('category').value = p.category || '';
  document.getElementById('productName').value = p.name;
  document.getElementById('linkedProductId').value = p.id;

  const existingPrice = allPrices.find(pr => pr.productId === id);
  priceUSDInput.value = existingPrice ? existingPrice.priceUSD : '';
  updatePreview();
}

// ── Preview conversion in modal ──────────────────────────────────────
async function updatePreview() {
  const val = parseFloat(priceUSDInput.value);
  if (isNaN(val)) { pricePreview.value = ''; return; }
  const currency = await window.CurrencyHelper.getActiveCurrency();
  const converted = await window.CurrencyHelper.convert(val, currency);
  pricePreview.value = window.CurrencyHelper.format(converted, currency);
}

// ── Modal open/close ──────────────────────────────────────────────────
function openModal(rowId) {
  priceForm.reset();
  document.getElementById('priceDocId').value = '';
  document.getElementById('linkedProductId').value = '';
  existingSelect.value = '';
  pricePreview.value = '';
  hideFormError();

  if (rowId) {
    const row = merged.find(r => r.rowId === rowId);
    if (row) {
      document.getElementById('modalTitle').textContent = row.priceUSD != null ? 'Edit Price' : 'Set Price';
      document.getElementById('priceDocId').value = row.priceDocId || '';
      document.getElementById('linkedProductId').value = row.productId || '';
      document.getElementById('category').value = row.category === '—' ? '' : row.category;
      document.getElementById('productName').value = row.name;
      priceUSDInput.value = row.priceUSD != null ? row.priceUSD : '';
      if (row.productId) existingSelect.value = row.productId;
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Add Price';
  }

  updatePreview();
  priceModal.classList.remove('hidden');
}

function closeModal() {
  priceModal.classList.add('hidden');
}

// ── Save / Delete ──────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  hideFormError();

  const category   = document.getElementById('category').value.trim();
  const name       = document.getElementById('productName').value.trim();
  const priceUSD   = Number(priceUSDInput.value);
  const docId      = document.getElementById('priceDocId').value;
  const productId  = document.getElementById('linkedProductId').value || null;

  if (!name)               { showFormError('Product name is required.'); return; }
  if (isNaN(priceUSD) || priceUSD < 0) { showFormError('Enter a valid price.'); return; }

  const data = { category, name, priceUSD, productId };
  const now  = new Date().toISOString();
  const user = auth().currentUser;
  const performedBy = user?.email || user?.uid || 'unknown';

  setSavingState(true);
  try {
    if (docId) {
      const before = allPrices.find(p => p.id === docId);
      const priceBefore = before ? (before.priceUSD ?? null) : null;
      data.updatedAt = now;

      const batch = pdb.batch();
      batch.update(pdb.collection('prices').doc(docId), data);
      logPriceHistory(batch, {
        actionType: 'Price Updated', category, productName: name,
        priceBefore, priceAfter: priceUSD, performedBy, createdAt: now,
      });
      await batch.commit();
    } else {
      // Avoid duplicate price docs for the same linked product
      if (productId) {
        const dup = allPrices.find(p => p.productId === productId);
        if (dup) {
          const priceBefore = dup.priceUSD ?? null;
          data.updatedAt = now;
          const batch = pdb.batch();
          batch.update(pdb.collection('prices').doc(dup.id), data);
          logPriceHistory(batch, {
            actionType: 'Price Updated', category, productName: name,
            priceBefore, priceAfter: priceUSD, performedBy, createdAt: now,
          });
          await batch.commit();
          closeModal();
          return;
        }
      }
      data.createdAt = now;
      data.updatedAt = now;
      const newRef = pdb.collection('prices').doc();
      const batch = pdb.batch();
      batch.set(newRef, data);
      logPriceHistory(batch, {
        actionType: 'Price Set', category, productName: name,
        priceBefore: null, priceAfter: priceUSD, performedBy, createdAt: now,
      });
      await batch.commit();
    }
    closeModal();
  } catch (err) {
    showFormError('Error saving price: ' + err.message);
  } finally {
    setSavingState(false);
  }
}

async function deletePrice(priceDocId) {
  if (!confirm('Remove this price? The product itself will not be affected.')) return;
  try {
    const before = allPrices.find(p => p.id === priceDocId);
    const user = auth().currentUser;
    const batch = pdb.batch();
    batch.delete(pdb.collection('prices').doc(priceDocId));
    logPriceHistory(batch, {
      actionType: 'Price Removed',
      category: before?.category || '',
      productName: before?.name || '—',
      priceBefore: before?.priceUSD ?? null,
      priceAfter: null,
      performedBy: user?.email || user?.uid || 'unknown',
      createdAt: new Date().toISOString(),
    });
    await batch.commit();
  } catch (err) {
    alert('Error deleting price: ' + err.message);
  }
}

// ── History logging ──────────────────────────────────────────────────
// Records every price add/edit/delete to the shared /history collection
// (same collection the Receive/Issue pages use) so History shows who
// changed a price and when.
function logPriceHistory(batch, { actionType, category, productName, priceBefore, priceAfter, performedBy, createdAt }) {
  const h = pdb.collection('history').doc();
  const desc = priceBefore == null
    ? `Price set to $${Number(priceAfter).toFixed(2)}`
    : (priceAfter == null
        ? `Price removed (was $${Number(priceBefore).toFixed(2)})`
        : `Price changed from $${Number(priceBefore).toFixed(2)} to $${Number(priceAfter).toFixed(2)}`);
  batch.set(h, {
    actionType, category, productName, description: desc,
    priceBefore, priceAfter, performedBy, createdAt,
  });
}

function setSavingState(saving) {
  document.getElementById('saveBtn').disabled = saving;
  saveBtnText.classList.toggle('hidden', saving);
  saveBtnSpinner.classList.toggle('hidden', !saving);
}

// ── Recent Price Changes (audit trail) ──────────────────────────────
// Reads the same /history collection Receive/Issue write to, filtered
// to price-related entries, so staff/admins can see who changed a price.
let unsubPriceHistory = null;

function loadRecentPriceChanges() {
  const tbody = document.getElementById('recentPriceChangesBody');
  if (!tbody) return;
  if (unsubPriceHistory) unsubPriceHistory();

  unsubPriceHistory = pdb.collection('history')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot(snap => {
      const rows = snap.docs
        .map(d => d.data())
        .filter(d => ['Price Set', 'Price Updated', 'Price Removed'].includes(d.actionType))
        .slice(0, 50);
      renderRecentPriceChanges(rows);
    }, err => {
      console.error('price history onSnapshot error:', err);
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Could not load price history.</td></tr>`;
    });
}

function renderRecentPriceChanges(rows) {
  const tbody = document.getElementById('recentPriceChangesBody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No price changes yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleString(undefined,
      { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const badgeClass = r.actionType === 'Price Removed' ? 'tx-badge--stockout'
      : (r.actionType === 'Price Set' ? 'tx-badge--in' : 'tx-badge--neutral');
    return `<tr>
      <td class="date-cell">${dateStr}</td>
      <td>${escPHtml(r.category || '—')}</td>
      <td class="product-cell">${escPHtml(r.productName || '—')}</td>
      <td><span class="tx-badge ${badgeClass}">${escPHtml(r.description || r.actionType || '—')}</span></td>
      <td>${escPHtml(r.performedBy || '—')}</td>
    </tr>`;
  }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────
function escPHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showFormError(msg) { formError.textContent = msg; formError.classList.remove('hidden'); }
function hideFormError()    { formError.classList.add('hidden'); formError.textContent = ''; }
