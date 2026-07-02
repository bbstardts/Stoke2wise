/**
 * grn.js — Goods Received Note
 * Category → Product two-step picker.
 * Description is a fully user-editable text input. It is only suggested
 * from the product's saved notes the first time a product is picked on an
 * empty row — once the user types anything, it is never overwritten again.
 */

const db   = () => window.firebaseDb;
const auth = () => window.firebaseAuth;

let productList  = [];
let categoryList = [];
let supplierList = [];
let rowCount     = 0;
let recentGrnsData = [];

/* ─── Boot ─────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('addGrnRow').addEventListener('click', addLineItemRow);
  document.getElementById('grnForm').addEventListener('submit', submitGrn);
  document.getElementById('resetGrn').addEventListener('click', resetForm);
  document.getElementById('exportGrnsBtn')?.addEventListener('click', () => {
    if (window.printRecentTransactionsReport) {
      window.printRecentTransactionsReport(recentGrnsData, { type: 'grn' });
    }
  });

  await loadProducts();
  await loadSuppliers();
  addLineItemRow();
  loadRecentGrns();
});

/* ─── Suppliers ─────────────────────────────────────────────────────────── */

async function loadSuppliers() {
  const sel  = document.getElementById('grnSupplier');
  const hint = document.getElementById('noSuppliersHint');
  try {
    const snap = await db().collection('suppliers').orderBy('name').get();
    supplierList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Could not load suppliers:', err);
    supplierList = [];
  }
  if (sel) {
    sel.innerHTML = '<option value="">— Select supplier —</option>' +
      supplierList.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
  }
  if (hint) hint.classList.toggle('hidden', supplierList.length > 0);
}

/* ─── Products ──────────────────────────────────────────────────────────── */

async function loadProducts() {
  try {
    const snap = await db().collection('products').orderBy('name').get();
    productList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cats = [...new Set(productList.map(p => p.category || 'Uncategorised'))].sort();
    categoryList = cats;
  } catch (err) {
    console.error('Could not load products:', err);
    productList = []; categoryList = [];
  }
}

/* ─── Add line item ─────────────────────────────────────────────────────── */

function addLineItemRow() {
  rowCount++;
  const id = rowCount;

  const catOptions = categoryList.map(c =>
    `<option value="${escHtml(c)}">${escHtml(c)}</option>`
  ).join('');

  /* ── Desktop table row ── */
  const tbody = document.getElementById('grnItemsBody');
  const row   = document.createElement('tr');
  row.dataset.row = id;
  row.innerHTML = `
    <td>
      <select class="line-category-select" id="catSel_${id}"
              onchange="handleCategorySelect(${id})">
        <option value="">— Category —</option>
        ${catOptions}
      </select>
    </td>
    <td>
      <select class="line-item-select" id="prodSel_${id}"
              name="product_${id}" disabled
              onchange="handleProductSelect(${id})">
        <option value="">— Select category first —</option>
      </select>
    </td>
    <td><input type="text" id="desc_${id}" class="desc-input" placeholder="Enter description…" /></td>
    <td>
      <input type="number" id="qty_${id}" name="qty_${id}"
             min="1" step="1" placeholder="0"
             oninput="syncQty(${id},'desktop')" />
    </td>
    <td><span id="stock_${id}" class="cell-muted">—</span></td>
    <td><button type="button" class="remove-row-btn" id="rmBtn_${id}"
                onclick="removeLineItem(${id})" title="Remove item">✕</button></td>`;
  tbody.appendChild(row);

  /* ── Mobile card ── */
  const cards = document.getElementById('grnItemsCards');
  const card  = document.createElement('div');
  card.className   = 'line-item-card';
  card.dataset.row = id;
  card.innerHTML = `
    <div class="line-item-card__header">
      <span class="line-item-card__num">Item ${id}</span>
      <button type="button" class="card-remove-btn" id="mRmBtn_${id}"
              onclick="removeLineItem(${id})" title="Remove item">✕ Remove</button>
    </div>
    <div class="card-field">
      <label>Category</label>
      <select id="mCatSel_${id}" onchange="handleCategorySelect(${id})">
        <option value="">— Select Category —</option>
        ${catOptions}
      </select>
    </div>
    <div class="card-field">
      <label>Product</label>
      <select id="mProdSel_${id}" disabled onchange="handleProductSelect(${id})">
        <option value="">— Select category first —</option>
      </select>
    </div>
    <div class="card-field">
      <label>Description</label>
      <input type="text" id="mDesc_${id}" class="desc-input"
             placeholder="Enter description…"
             oninput="syncDesc(${id},'mobile')" />
    </div>
    <div class="card-field-row">
      <div class="card-field">
        <label>Qty Received</label>
        <input type="number" id="mQty_${id}" min="1" step="1" placeholder="0"
               oninput="syncQty(${id},'mobile')" />
      </div>
      <div class="card-field">
        <label>In Stock</label>
        <div class="card-meta" id="mStock_${id}">—</div>
      </div>
    </div>`;
  cards.appendChild(card);

  /* wire desktop desc sync */
  const dDesc = document.getElementById(`desc_${id}`);
  if (dDesc) dDesc.addEventListener('input', () => syncDesc(id, 'desktop'));

  updateRemoveButtonsState();
}

/* ─── Remove-button enable/disable ──────────────────────────────────────── */

function updateRemoveButtonsState() {
  const rows = document.getElementById('grnItemsBody').querySelectorAll('tr');
  const onlyOne = rows.length <= 1;
  rows.forEach(row => {
    const id = row.dataset.row;
    const dBtn = document.getElementById(`rmBtn_${id}`);
    const mBtn = document.getElementById(`mRmBtn_${id}`);
    [dBtn, mBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = onlyOne;
      btn.title = onlyOne ? "Can't remove the only item — clear its fields instead" : 'Remove item';
    });
  });
}

function removeLineItem(id) {
  const allRows  = document.getElementById('grnItemsBody').querySelectorAll('tr');
  const allCards = document.querySelectorAll('#grnItemsCards .line-item-card');
  const totalItems = Math.max(allRows.length, allCards.length);
  if (totalItems <= 1) {
    // Can't delete the only row — clear it back to a blank state instead.
    clearLineItem(id);
    return;
  }
  document.querySelector(`#grnItemsBody tr[data-row="${id}"]`)?.remove();
  document.querySelector(`#grnItemsCards .line-item-card[data-row="${id}"]`)?.remove();
  updateRemoveButtonsState();
}

function clearLineItem(id) {
  ['catSel_','mCatSel_'].forEach(p => { const el = document.getElementById(`${p}${id}`); if (el) el.value = ''; });
  ['prodSel_','mProdSel_'].forEach(p => {
    const el = document.getElementById(`${p}${id}`);
    if (el) { el.innerHTML = '<option value="">— Select category first —</option>'; el.disabled = true; }
  });
  ['desc_','mDesc_'].forEach(p => {
    const el = document.getElementById(`${p}${id}`);
    if (el) { el.value = ''; delete el.dataset.userEdited; }
  });
  ['qty_','mQty_'].forEach(p => { const el = document.getElementById(`${p}${id}`); if (el) el.value = ''; });
  setStock(id, '—');
}

/* ─── Category select ───────────────────────────────────────────────────── */

function handleCategorySelect(id) {
  const desktopSel = document.getElementById(`catSel_${id}`);
  const mobileSel  = document.getElementById(`mCatSel_${id}`);
  const selectedCat = (document.activeElement === mobileSel ? mobileSel : desktopSel).value;
  if (desktopSel) desktopSel.value = selectedCat;
  if (mobileSel)  mobileSel.value  = selectedCat;

  // Reset product & stock, keep description (user may have typed something)
  setStock(id, '—');

  const filtered = selectedCat
    ? productList.filter(p => (p.category || 'Uncategorised') === selectedCat)
    : [];

  const placeholder = selectedCat
    ? (filtered.length ? '— Select product —' : '— No products in this category —')
    : '— Select category first —';

  const opts = `<option value="">${placeholder}</option>` + filtered.map(p =>
    `<option value="${p.id}"
             data-description="${escHtml(p.description || '')}"
             data-stock="${p.qty != null ? p.qty : 0}">
       ${escHtml(p.name)}
     </option>`).join('');

  const dProd = document.getElementById(`prodSel_${id}`);
  const mProd = document.getElementById(`mProdSel_${id}`);
  if (dProd) { dProd.innerHTML = opts; dProd.disabled = !filtered.length; }
  if (mProd) { mProd.innerHTML = opts; mProd.disabled = !filtered.length; }
}

/* ─── Product select ────────────────────────────────────────────────────── */

function handleProductSelect(id) {
  const desktopSel = document.getElementById(`prodSel_${id}`);
  const mobileSel  = document.getElementById(`mProdSel_${id}`);
  const activeSel  = (document.activeElement === mobileSel ? mobileSel : desktopSel);
  const val = activeSel.value;
  if (desktopSel) desktopSel.value = val;
  if (mobileSel)  mobileSel.value  = val;

  const opt = activeSel.selectedOptions[0];
  if (!val || !opt) { setStock(id, '—'); return; }

  // Suggest a starting description from the product's saved notes —
  // but only if the user hasn't already typed their own for this row.
  const dDesc = document.getElementById(`desc_${id}`);
  const mDesc = document.getElementById(`mDesc_${id}`);
  const alreadyEdited = dDesc?.dataset.userEdited === '1' || mDesc?.dataset.userEdited === '1';
  if (!alreadyEdited) {
    const productDesc = opt.dataset.description || '';
    if (dDesc) dDesc.value = productDesc;
    if (mDesc) mDesc.value = productDesc;
  }

  setStock(id, opt.dataset.stock ?? '—');
}

function setStock(id, stock) {
  const s  = document.getElementById(`stock_${id}`);
  const ms = document.getElementById(`mStock_${id}`);
  if (s)  s.textContent  = stock !== '—' ? `In stock: ${stock}` : '—';
  if (ms) ms.textContent = stock !== '—' ? `In stock: ${stock}` : '—';
}

function syncQty(id, source) {
  const desktop = document.getElementById(`qty_${id}`);
  const mobile  = document.getElementById(`mQty_${id}`);
  if (source === 'mobile'  && desktop && mobile) desktop.value = mobile.value;
  if (source === 'desktop' && desktop && mobile) mobile.value  = desktop.value;
}

function syncDesc(id, source) {
  const desktop = document.getElementById(`desc_${id}`);
  const mobile  = document.getElementById(`mDesc_${id}`);
  if (source === 'mobile'  && desktop && mobile) { desktop.value = mobile.value; desktop.dataset.userEdited = '1'; }
  if (source === 'desktop' && desktop && mobile) { mobile.value  = desktop.value; mobile.dataset.userEdited = '1'; }
  // Mark as user-edited
  if (desktop) desktop.dataset.userEdited = '1';
  if (mobile)  mobile.dataset.userEdited  = '1';
}

/* ─── Collect items ─────────────────────────────────────────────────────── */

function collectLineItems() {
  const rows  = document.getElementById('grnItemsBody').querySelectorAll('tr');
  const items = [];
  rows.forEach(row => {
    const id      = row.dataset.row;
    const catSel  = document.getElementById(`catSel_${id}`);
    const prodSel = document.getElementById(`prodSel_${id}`);
    const mQty    = document.getElementById(`mQty_${id}`);
    const dQty    = document.getElementById(`qty_${id}`);
    const qty     = parseInt(mQty?.value || dQty?.value || '', 10);
    const mDesc   = document.getElementById(`mDesc_${id}`);
    const dDesc   = document.getElementById(`desc_${id}`);
    const description = mDesc?.value || dDesc?.value || '';

    if (prodSel?.value && qty > 0) {
      const opt = prodSel.selectedOptions[0];
      items.push({
        productId:   prodSel.value,
        productName: opt.textContent.trim(),
        category:    catSel?.value || '',
        description,
        qty,
      });
    }
  });
  return items;
}

/* ─── Reset ─────────────────────────────────────────────────────────────── */

function resetForm() {
  document.getElementById('grnForm').reset();
  document.getElementById('grnItemsBody').innerHTML  = '';
  document.getElementById('grnItemsCards').innerHTML = '';
  rowCount = 0;
  addLineItemRow();
}

/* ─── Submit ────────────────────────────────────────────────────────────── */

async function submitGrn(e) {
  e.preventDefault();

  const supplierSel  = document.getElementById('grnSupplier');
  const supplierId   = supplierSel?.value || '';
  if (!supplierId) { showToast('Please select a supplier.', 'error'); return; }
  const supplierName = supplierSel.selectedOptions[0]?.textContent.trim() || '';

  const items = collectLineItems();
  if (!items.length) {
    showToast('Add at least one item with a quantity.', 'error'); return;
  }

  const docUrlInput   = document.getElementById('grnDocUrl');
  const docLabelInput = document.getElementById('grnDocLabel');
  const documentUrl   = docUrlInput?.value.trim() || '';
  const documentLabel = docLabelInput?.value.trim() || '';
  if (documentUrl && !/^https?:\/\//i.test(documentUrl)) {
    showToast('Document link must start with http:// or https://', 'error'); return;
  }

  const submitBtn = document.querySelector('#grnForm button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  const user = auth().currentUser;
  const now  = new Date().toISOString();

  let grnNumber = 'GRN-' + Date.now();
  try {
    const counterRef = db().collection('settings').doc('counters');
    const next = await db().runTransaction(async txn => {
      const snap = await txn.get(counterRef);
      const prev = snap.exists ? (snap.data().grnCount || 0) : 0;
      const n    = prev + 1;
      txn.set(counterRef, { grnCount: n }, { merge: true });
      return n;
    });
    grnNumber = 'GRN-' + String(next).padStart(4, '0');
  } catch (_) {}

  try {
    for (const item of items) {
      try {
        const snap = await db().collection('products').doc(item.productId).get();
        item.stockBefore = snap.exists ? (snap.data().qty ?? 0) : 0;
      } catch (_) { item.stockBefore = 0; }
    }

    const batch  = db().batch();
    const txRef  = db().collection('transactions').doc();
    batch.set(txRef, { type:'grn', grnNumber, items, supplierId, supplierName,
      documentUrl, documentLabel,
      createdBy: user?.email || user?.uid || 'unknown', createdAt: now });

    items.forEach(item => {
      batch.update(db().collection('products').doc(item.productId),
        { qty: firebase.firestore.FieldValue.increment(item.qty) });
    });
    items.forEach(item => {
      const h = db().collection('history').doc();
      batch.set(h, { actionType:'Received', category:item.category, productName:item.productName,
        description:item.description, qtyChanged:item.qty, stockBefore:item.stockBefore ?? 0,
        stockAfter:(item.stockBefore ?? 0)+item.qty, refNumber:grnNumber, supplierId, supplierName,
        documentUrl, documentLabel,
        performedBy:user?.email||user?.uid||'unknown', createdAt:now });
    });

    await batch.commit();
    showToast(`✓ ${grnNumber} saved — stock updated for ${items.length} product(s).`, 'success');
    resetForm();
    loadRecentGrns();
  } catch (err) {
    console.error('GRN submit failed:', err);
    showToast('Failed to save GRN.', 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit GRN';
  }
}

/* ─── Recent GRNs ───────────────────────────────────────────────────────── */

async function loadRecentGrns() {
  const tbody = document.getElementById('recentGrnsBody');
  const exportBtn = document.getElementById('exportGrnsBtn');
  tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Loading…</td></tr>`;
  try {
    const snap = await db().collection('transactions')
      .where('type','==','grn').orderBy('createdAt','desc').limit(50).get();
    recentGrnsData = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No GRNs yet.</td></tr>`; if (exportBtn) exportBtn.disabled = true; return; }
    tbody.innerHTML = renderGrnRows(recentGrnsData);
    if (exportBtn) exportBtn.disabled = false;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Could not load recent GRNs.</td></tr>`;
    if (exportBtn) exportBtn.disabled = true;
  }
}

/**
 * Groups by GRN transaction number (newest first).
 * Each GRN gets a blue header row showing its number, date, and user.
 * Then one row per product underneath it, with a subtotal + View button.
 */
function renderGrnRows(grns) {
  return grns.map(grn => {
    const dateStr = grn.createdAt ? new Date(grn.createdAt).toLocaleString(undefined,
      {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '—';
    const items    = grn.items || [];
    const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

    const docChip = grn.documentUrl
      ? `<a href="${escHtml(grn.documentUrl)}" target="_blank" rel="noopener"
            class="totals-chip" style="background:rgba(37,99,235,0.08);color:var(--color-primary);margin-left:8px;text-decoration:none"
            title="Open attached document">📎 ${escHtml(grn.documentLabel || 'Document')}</a>`
      : '';

    const headerRow = `<tr class="history-category-row">
      <td><strong>${escHtml(grn.grnNumber || '—')}</strong>${docChip}</td>
      <td colspan="2">${dateStr}</td>
      <td>${escHtml(grn.supplierName || '—')}</td>
      <td colspan="2">${escHtml(grn.createdBy || '—')}</td>
    </tr>`;

    const itemRows = items.map(item => `<tr>
      <td></td>
      <td>${escHtml(item.category || '—')}</td>
      <td>${escHtml(item.productName || '—')}</td>
      <td><span class="qty-badge qty-badge--in" style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600;background:#dcfce7;color:#166534">+${Number(item.qty)||0}</span></td>
      <td colspan="2">${escHtml(item.description || '—')}</td>
    </tr>`).join('');

    const subtotalRow = `<tr class="history-category-subtotal-row">
      <td colspan="3" class="totals-label">${items.length} product${items.length !== 1 ? 's' : ''}</td>
      <td class="num-cell totals-num">
        <span class="totals-chip totals-chip--in">+${totalQty} rcv</span>
      </td>
      <td colspan="2" style="text-align:right">
        <button class="action-btn" onclick="viewGrnDetail('${grn.id}')">View</button>
      </td>
    </tr>`;

    return headerRow + itemRows + subtotalRow;
  }).join('');
}

/* ─── Detail modal ──────────────────────────────────────────────────────── */

let _currentGrnData = null;
function printCurrentGrn() {
  if (_currentGrnData && window.printGrnReceipt) window.printGrnReceipt(_currentGrnData);
}

async function viewGrnDetail(id) {
  const modal   = document.getElementById('grnDetailModal');
  const title   = document.getElementById('grnDetailTitle');
  const content = document.getElementById('grnDetailContent');
  if (!modal) return;
  _currentGrnData = null;
  modal.classList.remove('hidden');
  title.textContent = 'Loading…';
  content.innerHTML = '';
  const printBtn = document.getElementById('printGrnBtn');
  if (printBtn) printBtn.disabled = true;
  try {
    const snap = await db().collection('transactions').doc(id).get();
    if (!snap.exists) { title.textContent = 'Not found'; return; }
    const g = snap.data();
    _currentGrnData = g;
    if (printBtn) printBtn.disabled = false;
    title.textContent = g.grnNumber;
    const dateStr = g.createdAt ? new Date(g.createdAt).toLocaleString(undefined,
      {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
    const rows = (g.items||[]).map(i => `<tr>
      <td>${escHtml(i.category||'—')}</td>
      <td>${escHtml(i.productName)}</td>
      <td>${escHtml(i.description||'—')}</td>
      <td>${i.qty}</td>
    </tr>`).join('');
    const docSection = g.documentUrl
      ? `<div style="margin-top:12px">
          <strong>Attached Document:</strong>
          <a href="${escHtml(g.documentUrl)}" target="_blank" rel="noopener"
             style="color:var(--color-primary);margin-left:6px">
            📎 ${escHtml(g.documentLabel || 'View document')}
          </a>
        </div>`
      : '';

    content.innerHTML = `
      <div class="detail-meta">
        <span><strong>Date / Time:</strong> ${dateStr}</span>
        <span><strong>Supplier:</strong> ${escHtml(g.supplierName||'—')}</span>
        <span><strong>Received by:</strong> ${g.createdBy||'—'}</span>
      </div>
      ${docSection}
      <div class="table-scroll-wrap" style="margin-top:16px">
        <table class="data-table">
          <thead><tr><th>Category</th><th>Product</th><th>Description</th><th>Qty</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-danger)">Error loading detail.</p>`;
  }
}

/* ─── Toast ─────────────────────────────────────────────────────────────── */

function showToast(msg, type='success') {
  let t = document.getElementById('grnToast');
  if (!t) {
    t = document.createElement('div'); t.id = 'grnToast';
    t.style.cssText = `position:fixed;bottom:24px;right:16px;z-index:9999;
      padding:12px 18px;border-radius:8px;font-size:14px;font-weight:500;
      box-shadow:0 4px 20px rgba(0,0,0,.35);transition:opacity .3s;
      max-width:calc(100vw - 32px);line-height:1.4;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === 'success' ? 'var(--color-primary)' : 'var(--color-danger)';
  t.style.color = '#fff'; t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 3800);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
