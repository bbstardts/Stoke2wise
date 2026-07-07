/**
 * issue.js — Stock Issue (OUT)
 * Category → Product two-step picker.
 * Description is a fully user-editable text input. It is only suggested
 * from the product's saved notes the first time a product is picked on an
 * empty row — once the user types anything, it is never overwritten again.
 */

const db   = () => window.firebaseDb;
const auth = () => window.firebaseAuth;

let productList  = [];
let categoryList = [];
let departmentList = [];
let rowCount     = 0;
let recentIssuesData = [];

const DEFAULT_DEPARTMENTS = ['Poultry', 'Crop', 'Maintenance', 'Admin'];

/* ─── Boot ─────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('addIssueRow').addEventListener('click', addLineItemRow);
  document.getElementById('issueForm').addEventListener('submit', submitIssue);
  document.getElementById('resetIssue').addEventListener('click', resetForm);
  document.getElementById('exportIssuesBtn')?.addEventListener('click', () => {
    if (window.printRecentTransactionsReport) {
      window.printRecentTransactionsReport(recentIssuesData, { type: 'issue' });
    }
  });

  await loadProducts();
  await loadDepartments();
  addLineItemRow();
  loadRecentIssues();
});

/* ─── Departments ───────────────────────────────────────────────────────── */

async function loadDepartments() {
  const sel = document.getElementById('issueDepartment');
  try {
    const doc = await db().collection('settings').doc('config').get();
    departmentList = (doc.exists && Array.isArray(doc.data().departments) && doc.data().departments.length)
      ? doc.data().departments
      : DEFAULT_DEPARTMENTS;
  } catch (err) {
    console.error('Could not load departments:', err);
    departmentList = DEFAULT_DEPARTMENTS;
  }
  if (sel) {
    sel.innerHTML = '<option value="">— Select department —</option>' +
      departmentList.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
  }
}

/* ─── Products ──────────────────────────────────────────────────────────── */

async function loadProducts() {
  try {
    const snap = await db().collection('products').orderBy('name').get();
    productList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    categoryList = getDistinctCategoriesIssue(productList);
  } catch (err) {
    console.error('Could not load products:', err);
    productList = []; categoryList = [];
  }
}

// De-duplicates categories by case/whitespace, same normalization as
// products.js's getDistinctCategories(), so legacy data with mixed casing
// (e.g. "Tractor" and "tractor ") doesn't show as two dropdown entries here.
function getDistinctCategoriesIssue(products) {
  const seen = new Map(); // lowercase-trimmed key -> display value (first seen wins)
  products.forEach(p => {
    const raw = (p.category || 'Uncategorised').trim() || 'Uncategorised';
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, raw);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/* ─── Add line item ─────────────────────────────────────────────────────── */

function addLineItemRow() {
  rowCount++;
  const id = rowCount;

  const catOptions = categoryList.map(c =>
    `<option value="${escHtml(c)}">${escHtml(c)}</option>`
  ).join('');

  /* ── Desktop table row ── */
  const tbody = document.getElementById('issueItemsBody');
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
    <td><span id="avail_${id}" class="cell-muted">—</span></td>
    <td>
      <input type="number" id="qty_${id}" name="qty_${id}"
             min="1" step="1" placeholder="0"
             oninput="syncQty(${id},'desktop'); validateQty(${id})" />
    </td>
    <td><button type="button" class="remove-row-btn" id="rmBtn_${id}"
                onclick="removeLineItem(${id})" title="Remove item">✕</button></td>`;
  tbody.appendChild(row);

  /* ── Mobile card ── */
  const cards  = document.getElementById('issueItemsCards');
  const card   = document.createElement('div');
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
        <label>Qty to Issue</label>
        <input type="number" id="mQty_${id}" min="1" step="1" placeholder="0"
               oninput="syncQty(${id},'mobile'); validateQty(${id})" />
      </div>
      <div class="card-field">
        <label>Available</label>
        <div class="card-meta" id="mAvail_${id}">—</div>
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
  const rows = document.getElementById('issueItemsBody').querySelectorAll('tr');
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
  const allRows  = document.getElementById('issueItemsBody').querySelectorAll('tr');
  const allCards = document.querySelectorAll('#issueItemsCards .line-item-card');
  // Keep at least one item — check total unique row IDs
  const totalItems = Math.max(allRows.length, allCards.length);
  if (totalItems <= 1) {
    // Can't delete the only row — clear it back to a blank state instead.
    clearLineItem(id);
    checkOverallWarning();
    return;
  }
  document.querySelector(`#issueItemsBody tr[data-row="${id}"]`)?.remove();
  document.querySelector(`#issueItemsCards .line-item-card[data-row="${id}"]`)?.remove();
  updateRemoveButtonsState();
  checkOverallWarning();
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
  setAvail(id, '—');
}

/* ─── Category select ───────────────────────────────────────────────────── */

function handleCategorySelect(id) {
  const dSel = document.getElementById(`catSel_${id}`);
  const mSel = document.getElementById(`mCatSel_${id}`);
  const selectedCat = (document.activeElement === mSel ? mSel : dSel).value;
  if (dSel) dSel.value = selectedCat;
  if (mSel) mSel.value = selectedCat;

  setAvail(id, '—');

  // Compare case/whitespace-insensitively so the normalized dropdown value
  // (e.g. "Tractor") still matches raw product docs stored as "tractor " etc.
  const filtered = selectedCat
    ? productList.filter(p => (p.category || 'Uncategorised').trim().toLowerCase() === selectedCat.toLowerCase())
    : [];

  const placeholder = selectedCat
    ? (filtered.length ? '— Select product —' : '— No products in this category —')
    : '— Select category first —';

  const opts = `<option value="">${placeholder}</option>` + filtered.map(p =>
    `<option value="${p.id}"
             data-description="${escHtml(p.description || '')}"
             data-qty="${p.qty != null ? p.qty : 0}">
       ${escHtml(p.name)}
     </option>`).join('');

  const dProd = document.getElementById(`prodSel_${id}`);
  const mProd = document.getElementById(`mProdSel_${id}`);
  if (dProd) { dProd.innerHTML = opts; dProd.disabled = !filtered.length; }
  if (mProd) { mProd.innerHTML = opts; mProd.disabled = !filtered.length; }

  checkOverallWarning();
}

/* ─── Product select ────────────────────────────────────────────────────── */

function handleProductSelect(id) {
  const dSel = document.getElementById(`prodSel_${id}`);
  const mSel = document.getElementById(`mProdSel_${id}`);
  const activeSel = (document.activeElement === mSel ? mSel : dSel);
  const val = activeSel.value;
  if (dSel) dSel.value = val;
  if (mSel) mSel.value = val;

  const opt = activeSel.selectedOptions[0];
  if (!val || !opt) { setAvail(id, '—'); return; }

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

  setAvail(id, opt.dataset.qty ?? '—');
  validateQty(id);
}

function setAvail(id, avail) {
  const a  = document.getElementById(`avail_${id}`);
  const ma = document.getElementById(`mAvail_${id}`);
  if (a)  a.textContent  = avail !== '—' ? avail : '—';
  if (ma) ma.textContent = avail !== '—' ? avail : '—';
}

function syncQty(id, source) {
  const d = document.getElementById(`qty_${id}`);
  const m = document.getElementById(`mQty_${id}`);
  if (source === 'mobile'  && d && m) d.value = m.value;
  if (source === 'desktop' && d && m) m.value = d.value;
}

function syncDesc(id, source) {
  const desktop = document.getElementById(`desc_${id}`);
  const mobile  = document.getElementById(`mDesc_${id}`);
  if (source === 'mobile'  && desktop && mobile) desktop.value = mobile.value;
  if (source === 'desktop' && desktop && mobile) mobile.value  = desktop.value;
  if (desktop) desktop.dataset.userEdited = '1';
  if (mobile)  mobile.dataset.userEdited  = '1';
}

/* ─── Validation ────────────────────────────────────────────────────────── */

function validateQty(id) {
  const availEl = document.getElementById(`avail_${id}`);
  const avail   = parseFloat(availEl?.textContent);
  const dQty    = document.getElementById(`qty_${id}`);
  const mQty    = document.getElementById(`mQty_${id}`);
  const qty     = parseFloat(dQty?.value || mQty?.value || '');

  const over = !isNaN(qty) && !isNaN(avail) && qty > avail;
  const color = over ? 'var(--color-danger)' : '';
  if (dQty) dQty.style.borderColor = color;
  if (mQty) mQty.style.borderColor = color;
  checkOverallWarning();
}

function checkOverallWarning() {
  const rows = document.getElementById('issueItemsBody').querySelectorAll('tr');
  let hasOver = false;
  rows.forEach(row => {
    const id    = row.dataset.row;
    const avail = parseFloat(document.getElementById(`avail_${id}`)?.textContent);
    const qty   = parseFloat(document.getElementById(`qty_${id}`)?.value
                          || document.getElementById(`mQty_${id}`)?.value || '');
    if (!isNaN(qty) && !isNaN(avail) && qty > avail) hasOver = true;
  });
  document.getElementById('stockWarning').classList.toggle('hidden', !hasOver);
  document.getElementById('submitIssue').disabled = hasOver;
}

/* ─── Collect ───────────────────────────────────────────────────────────── */

function collectLineItems() {
  const rows  = document.getElementById('issueItemsBody').querySelectorAll('tr');
  const items = [];
  rows.forEach(row => {
    const id      = row.dataset.row;
    const catSel  = document.getElementById(`catSel_${id}`);
    const prodSel = document.getElementById(`prodSel_${id}`);
    const qty     = parseInt(
      document.getElementById(`mQty_${id}`)?.value ||
      document.getElementById(`qty_${id}`)?.value || '', 10);
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
  document.getElementById('issueForm').reset();
  document.getElementById('issueItemsBody').innerHTML   = '';
  document.getElementById('issueItemsCards').innerHTML  = '';
  document.getElementById('stockWarning').classList.add('hidden');
  rowCount = 0;
  addLineItemRow();
}

/* ─── Submit ────────────────────────────────────────────────────────────── */

async function submitIssue(e) {
  e.preventDefault();
  const department = document.getElementById('issueDepartment')?.value || '';
  if (!department) { showToast('Please select a receiving department.', 'error'); return; }

  const items = collectLineItems();
  if (!items.length) { showToast('Add at least one item with a quantity.', 'error'); return; }

  try {
    for (const item of items) {
      const snap = await db().collection('products').doc(item.productId).get();
      if (!snap.exists) { showToast(`Product "${item.productName}" not found.`, 'error'); return; }
      const cur = snap.data().qty ?? 0;
      item.stockBefore = cur;
      if (item.qty > cur) {
        showToast(`"${item.productName}" only has ${cur} available — requested ${item.qty}.`, 'error');
        return;
      }
    }
  } catch (err) { showToast('Could not verify stock levels.', 'error'); return; }

  const submitBtn = document.getElementById('submitIssue');
  submitBtn.disabled = true; submitBtn.textContent = 'Saving…';

  const user = auth().currentUser;
  const now  = new Date().toISOString();

  let issueNumber = 'ISS-' + Date.now();
  try {
    const counterRef = db().collection('settings').doc('counters');
    const next = await db().runTransaction(async txn => {
      const snap = await txn.get(counterRef);
      const prev = snap.exists ? (snap.data().issueCount || 0) : 0;
      const n = prev + 1;
      txn.set(counterRef, { issueCount: n }, { merge: true });
      return n;
    });
    issueNumber = 'ISS-' + String(next).padStart(4,'0');
  } catch (_) {}

  try {
    const batch = db().batch();
    const txRef = db().collection('transactions').doc();
    batch.set(txRef, { type:'issue', issueNumber, items, department,
      createdBy: user?.email||user?.uid||'unknown', createdAt: now });

    items.forEach(item => {
      batch.update(db().collection('products').doc(item.productId),
        { qty: firebase.firestore.FieldValue.increment(-item.qty) });
    });
    items.forEach(item => {
      const stockAfter = (item.stockBefore ?? 0) - item.qty;
      const h = db().collection('history').doc();
      batch.set(h, { actionType:'Issued', category:item.category, productName:item.productName,
        description:item.description, qtyChanged:item.qty, stockBefore:item.stockBefore??0,
        stockAfter, refNumber:issueNumber, department,
        performedBy:user?.email||user?.uid||'unknown', createdAt:now });

      if (stockAfter <= 0) {
        const hOut = db().collection('history').doc();
        batch.set(hOut, {
          actionType: 'Stock Out',
          category: item.category,
          productName: item.productName,
          description: `Stock depleted via ${issueNumber}`,
          qtyChanged: 0,
          stockBefore: item.stockBefore ?? 0,
          stockAfter,
          refNumber: issueNumber,
          department,
          performedBy: user?.email || user?.uid || 'unknown',
          createdAt: now,
        });
      }
    });

    await batch.commit();
    showToast(`✓ ${issueNumber} saved — stock reduced for ${items.length} product(s).`, 'success');
    resetForm();
    loadRecentIssues();
  } catch (err) {
    console.error('Issue submit failed:', err);
    showToast('Failed to save Issue.', 'error');
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = 'Submit Issue';
  }
}

/* ─── Recent Issues ─────────────────────────────────────────────────────── */

async function loadRecentIssues() {
  const tbody = document.getElementById('recentIssuesBody');
  const exportBtn = document.getElementById('exportIssuesBtn');
  tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Loading…</td></tr>`;
  try {
    const snap = await db().collection('transactions')
      .where('type','==','issue').orderBy('createdAt','desc').limit(50).get();
    recentIssuesData = snap.docs.map(d => ({id:d.id,...d.data()}));
    if (snap.empty) { tbody.innerHTML=`<tr><td colspan="6" class="table-empty">No issues yet.</td></tr>`; if (exportBtn) exportBtn.disabled = true; return; }
    tbody.innerHTML = renderIssueRows(recentIssuesData);
    if (exportBtn) exportBtn.disabled = false;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Could not load recent issues.</td></tr>`;
    if (exportBtn) exportBtn.disabled = true;
  }
}

/**
 * Groups by Issue transaction number (newest first).
 * Each Issue gets a blue header row showing its number, date, and user.
 * Then one row per product underneath it, with a subtotal + View button.
 */
function renderIssueRows(issues) {
  return issues.map(iss => {
    const dateStr = iss.createdAt ? new Date(iss.createdAt).toLocaleString(undefined,
      {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '—';
    const items    = iss.items || [];
    const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

    const headerRow = `<tr class="history-category-row">
      <td><strong>${escHtml(iss.issueNumber || '—')}</strong></td>
      <td colspan="2">${dateStr}</td>
      <td>${escHtml(iss.department || '—')}</td>
      <td colspan="2">${escHtml(iss.createdBy || '—')}</td>
    </tr>`;

    const itemRows = items.map(item => `<tr>
      <td></td>
      <td>${escHtml(item.category || '—')}</td>
      <td>${escHtml(item.productName || '—')}</td>
      <td><span class="qty-badge qty-badge--out" style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600;background:#fee2e2;color:#991b1b">−${Number(item.qty)||0}</span></td>
      <td colspan="2">${escHtml(item.description || '—')}</td>
    </tr>`).join('');

    const subtotalRow = `<tr class="history-category-subtotal-row">
      <td colspan="3" class="totals-label">${items.length} product${items.length !== 1 ? 's' : ''}</td>
      <td class="num-cell totals-num">
        <span class="totals-chip totals-chip--out">−${totalQty} iss</span>
      </td>
      <td colspan="2" style="text-align:right">
        <button class="action-btn" onclick="viewIssueDetail('${iss.id}')">View</button>
      </td>
    </tr>`;

    return headerRow + itemRows + subtotalRow;
  }).join('');
}

/* ─── Detail modal ──────────────────────────────────────────────────────── */

let _currentIssueData = null;
function printCurrentIssue() {
  if (_currentIssueData && window.printIssueReceipt) window.printIssueReceipt(_currentIssueData);
}

async function viewIssueDetail(id) {
  const modal   = document.getElementById('issueDetailModal');
  const title   = document.getElementById('issueDetailTitle');
  const content = document.getElementById('issueDetailContent');
  if (!modal) return;
  _currentIssueData = null;
  modal.classList.remove('hidden');
  title.textContent = 'Loading…'; content.innerHTML = '';
  const printBtn = document.getElementById('printIssueBtn');
  if (printBtn) printBtn.disabled = true;
  try {
    const snap = await db().collection('transactions').doc(id).get();
    if (!snap.exists) { title.textContent = 'Not found'; return; }
    const iss = snap.data();
    _currentIssueData = iss;
    if (printBtn) printBtn.disabled = false;
    title.textContent = iss.issueNumber;
    const dateStr = iss.createdAt ? new Date(iss.createdAt).toLocaleString(undefined,
      {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
    const rows = (iss.items||[]).map(i => `<tr>
      <td>${escHtml(i.category||'—')}</td>
      <td>${escHtml(i.productName)}</td>
      <td>${escHtml(i.description||'—')}</td>
      <td>${i.qty}</td>
    </tr>`).join('');
    content.innerHTML = `
      <div class="detail-meta">
        <span><strong>Date / Time:</strong> ${dateStr}</span>
        <span><strong>Department:</strong> ${escHtml(iss.department||'—')}</span>
        <span><strong>Issued by:</strong> ${iss.createdBy||'—'}</span>
      </div>
      <div class="table-scroll-wrap" style="margin-top:16px">
        <table class="data-table">
          <thead><tr><th>Category</th><th>Product</th><th>Description</th><th>Qty Issued</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-danger)">Error loading detail.</p>`;
  }
}

/* ─── Toast ─────────────────────────────────────────────────────────────── */

function showToast(msg, type='success') {
  let t = document.getElementById('issueToast');
  if (!t) {
    t = document.createElement('div'); t.id = 'issueToast';
    t.style.cssText = `position:fixed;bottom:24px;right:16px;z-index:9999;
      padding:12px 18px;border-radius:8px;font-size:14px;font-weight:500;
      box-shadow:0 4px 20px rgba(0,0,0,.35);transition:opacity .3s;
      max-width:calc(100vw - 32px);line-height:1.4;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === 'success' ? 'var(--color-success)' : 'var(--color-danger)';
  t.style.color = '#fff'; t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 4000);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
