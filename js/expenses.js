/**
 * expenses.js — Expense Tracker
 * ─────────────────────────────────────────────
 * Purpose: Log store-related expenses (purchases/repairs/consumables/other),
 *          show a filterable/sortable history, and a monthly total view.
 *
 * Depends on: firebase-config.js (auth, db), auth-guard.js, role-gate.js
 * Used by:    pages/expenses.html
 *
 * Firestore reads/writes:
 *   /expenses            — one doc per expense entry
 *     { date, category, amount, description, createdBy, createdAt }
 *   /settings/config      — expenseCategories: string[] (same doc/pattern as
 *                            departments in settings.js)
 *
 * Role checks (mirrors role-gate.js / auth-guard.js pattern used elsewhere):
 *   viewer — read-only (form + category manager hidden via data-min-role)
 *   staff  — can log expenses
 *   admin  — can also manage the category list
 */

const DEFAULT_EXPENSE_CATEGORIES = ['Purchases', 'Repairs', 'Consumables', 'Other'];

let allExpenses     = [];
let expenseCategories = DEFAULT_EXPENSE_CATEGORIES.slice();
let unsubscribeExp  = null;

let filterCategory  = 'all';
let filterMonth     = ''; // 'YYYY-MM' or '' for all
let sortField        = 'date';
let sortDir           = 'desc';

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  document.getElementById('expenseDate').value = today.toISOString().slice(0, 10);
  makeDatePicker(document.getElementById('expenseDate'), { clearable: false });

  wireControls();
  loadCategories();
  startListener();
});

/* ─── Categories (settings/config.expenseCategories, mirrors departments) ── */

async function loadCategories() {
  try {
    const doc = await window.firebaseDb.collection('settings').doc('config').get();
    const cats = (doc.exists && Array.isArray(doc.data().expenseCategories) && doc.data().expenseCategories.length)
      ? doc.data().expenseCategories
      : DEFAULT_EXPENSE_CATEGORIES;
    expenseCategories = cats;
  } catch (err) {
    console.warn('Could not load expense categories, using defaults:', err.message);
    expenseCategories = DEFAULT_EXPENSE_CATEGORIES.slice();
  }
  renderCategoryOptions();
  renderCategoryManager();
}

function renderCategoryOptions() {
  const formSel   = document.getElementById('expenseCategory');
  const filterSel = document.getElementById('expenseCategoryFilter');
  const optsHtml  = expenseCategories.map(c => `<option value="${escExp(c)}">${escExp(c)}</option>`).join('');

  if (formSel) formSel.innerHTML = `<option value="">— Select category —</option>${optsHtml}`;
  if (filterSel) {
    const current = filterSel.value || 'all';
    filterSel.innerHTML = `<option value="all">All Categories</option>${optsHtml}`;
    filterSel.value = expenseCategories.includes(current) ? current : 'all';
    filterCategory = filterSel.value;
  }
  makeSearchable(formSel,   { searchable: false });
  makeSearchable(filterSel, { searchable: false });
}

function renderCategoryManager() {
  const tbody = document.getElementById('expenseCategoriesBody');
  if (!tbody) return;
  if (!expenseCategories.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="color:var(--color-text-muted);text-align:center;padding:16px">No categories yet — add one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = expenseCategories.map(c => `
    <tr>
      <td>${escExp(c)}</td>
      <td><button class="btn-ghost" style="font-size:12px" onclick="removeExpenseCategory('${escExp(c).replace(/'/g, "\\'")}')">Remove</button></td>
    </tr>`).join('');
}

async function addExpenseCategory(e) {
  e.preventDefault();
  const input = document.getElementById('newCategoryName');
  const name  = input.value.trim();
  if (!name) return;
  try {
    const ref = window.firebaseDb.collection('settings').doc('config');
    const doc = await ref.get();
    const cats = (doc.exists && Array.isArray(doc.data().expenseCategories) && doc.data().expenseCategories.length)
      ? doc.data().expenseCategories
      : DEFAULT_EXPENSE_CATEGORIES.slice();
    if (cats.some(c => c.toLowerCase() === name.toLowerCase())) {
      customAlert('That category already exists.', 'warning');
      return;
    }
    cats.push(name);
    await ref.set({ expenseCategories: cats, updatedAt: new Date().toISOString() }, { merge: true });
    input.value = '';
    expenseCategories = cats;
    renderCategoryOptions();
    renderCategoryManager();
  } catch (err) {
    customAlert('Failed to add category: ' + err.message, 'error');
  }
}

async function removeExpenseCategory(name) {
  if (!(await customConfirm(`Remove category "${name}"? Past expenses keep their recorded category.`, { danger: true }))) return;
  try {
    const ref = window.firebaseDb.collection('settings').doc('config');
    const doc = await ref.get();
    const cats = (doc.exists && Array.isArray(doc.data().expenseCategories) && doc.data().expenseCategories.length)
      ? doc.data().expenseCategories
      : DEFAULT_EXPENSE_CATEGORIES.slice();
    const updated = cats.filter(c => c !== name);
    await ref.set({ expenseCategories: updated, updatedAt: new Date().toISOString() }, { merge: true });
    expenseCategories = updated;
    renderCategoryOptions();
    renderCategoryManager();
  } catch (err) {
    customAlert('Failed to remove category: ' + err.message, 'error');
  }
}
window.removeExpenseCategory = removeExpenseCategory;

/* ─── Live listener ─────────────────────────────────────────────────────── */

function startListener() {
  const tbody = document.getElementById('expensesBody');
  tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Loading…</td></tr>`;

  if (unsubscribeExp) unsubscribeExp();
  unsubscribeExp = window.firebaseDb.collection('expenses')
    .orderBy('date', 'desc')
    .onSnapshot(
      snap => {
        allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTable();
        renderMonthSummary();
      },
      err => {
        console.error('expenses onSnapshot error:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:var(--color-danger)">Failed to load expenses.</td></tr>`;
      }
    );
}

/* ─── Controls ──────────────────────────────────────────────────────────── */

function wireControls() {
  document.getElementById('expenseForm').addEventListener('submit', submitExpense);
  document.getElementById('categoryForm')?.addEventListener('submit', addExpenseCategory);

  document.getElementById('expenseCategoryFilter').addEventListener('change', (e) => {
    filterCategory = e.target.value;
    renderTable();
  });
  document.getElementById('expenseMonthFilter').addEventListener('change', (e) => {
    filterMonth = e.target.value;
    renderTable();
    renderMonthSummary();
  });
  document.getElementById('clearExpenseFilters').addEventListener('click', () => {
    filterCategory = 'all';
    filterMonth = '';
    document.getElementById('expenseCategoryFilter').value = 'all';
    document.getElementById('expenseMonthFilter').value = '';
    renderTable();
    renderMonthSummary();
  });

  document.querySelectorAll('.sortable-th').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = field;
        sortDir = field === 'date' ? 'desc' : 'asc';
      }
      updateSortIndicators();
      renderTable();
    });
  });
  updateSortIndicators();

  document.getElementById('exportExpensesCsvBtn')?.addEventListener('click', exportExpensesCSV);
  document.getElementById('exportExpensesPdfBtn')?.addEventListener('click', exportExpensesPDF);
}

function updateSortIndicators() {
  document.querySelectorAll('.sortable-th').forEach(th => {
    const active = th.dataset.sort === sortField;
    th.classList.toggle('sort-active', active);
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅';
  });
}

/* ─── Submit new expense ────────────────────────────────────────────────── */

async function submitExpense(e) {
  e.preventDefault();

  const date        = document.getElementById('expenseDate').value;
  const category     = document.getElementById('expenseCategory').value;
  const amount        = Number(document.getElementById('expenseAmount').value);
  const description  = document.getElementById('expenseDescription').value.trim();

  if (!date)              { showExpToast('Please pick a date.', 'error'); return; }
  if (!category)           { showExpToast('Please select a category.', 'error'); return; }
  if (!amount || amount <= 0) { showExpToast('Please enter a valid amount.', 'error'); return; }

  const submitBtn = document.querySelector('#expenseForm button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  const user = window.firebaseAuth.currentUser;

  try {
    await window.firebaseDb.collection('expenses').add({
      date,
      category,
      amount,
      description,
      createdBy: user?.email || user?.uid || 'unknown',
      createdAt: new Date().toISOString(),
    });
    showExpToast('✓ Expense logged.', 'success');
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDate').value = new Date().toISOString().slice(0, 10);
  } catch (err) {
    console.error('Failed to save expense:', err);
    showExpToast('Failed to save expense.', 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Log Expense';
  }
}

/* ─── Filtering / sorting ───────────────────────────────────────────────── */

function getFilteredExpenses() {
  return allExpenses.filter(x => {
    const matchesCategory = filterCategory === 'all' || (x.category || '') === filterCategory;
    const matchesMonth    = !filterMonth || (x.date || '').slice(0, 7) === filterMonth;
    return matchesCategory && matchesMonth;
  });
}

function getSortedExpenses(list) {
  const sorted = list.slice().sort((a, b) => {
    let av, bv;
    switch (sortField) {
      case 'amount':      av = Number(a.amount) || 0; bv = Number(b.amount) || 0; break;
      case 'category':    av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); break;
      case 'description': av = (a.description || '').toLowerCase(); bv = (b.description || '').toLowerCase(); break;
      case 'date':
      default:            av = a.date || ''; bv = b.date || ''; break;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

/* ─── Render table ──────────────────────────────────────────────────────── */

function renderTable() {
  const tbody = document.getElementById('expensesBody');
  const tfoot = document.getElementById('expensesFoot');
  const count = document.getElementById('expenseCount');

  const filtered = getSortedExpenses(getFilteredExpenses());
  count.textContent = `${filtered.length} expense${filtered.length !== 1 ? 's' : ''}`;

  const exportCsv = document.getElementById('exportExpensesCsvBtn');
  const exportPdf = document.getElementById('exportExpensesPdfBtn');
  if (exportCsv) exportCsv.disabled = filtered.length === 0;
  if (exportPdf) exportPdf.disabled = filtered.length === 0;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No expenses found.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = filtered.map(x => `
    <tr>
      <td class="date-cell">${fmtExpDate(x.date)}</td>
      <td><span class="cat-badge-editable">${escExp(x.category || '—')}</span></td>
      <td class="td-desc" title="${escExp(x.description || '')}">${escExp((x.description || '—'))}</td>
      <td class="amount-cell">${fmtCurrency(x.amount)}</td>
      <td>
        <button class="action-btn action-btn--danger" onclick="deleteExpense('${x.id}')" data-min-role="staff">Delete</button>
      </td>
    </tr>`).join('');

  const total = filtered.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  if (tfoot) {
    tfoot.innerHTML = `<tr class="history-totals-row">
      <td colspan="3" class="totals-label">Total for ${filtered.length} expense${filtered.length !== 1 ? 's' : ''}:</td>
      <td class="amount-cell totals-num">${fmtCurrency(total)}</td>
      <td></td>
    </tr>`;
  }

  // Re-apply role gating to freshly-rendered delete buttons.
  if (window.currentUserRole) {
    const RANK = { viewer: 0, staff: 1, admin: 2 };
    const myRank = RANK[window.currentUserRole] ?? 1;
    tbody.querySelectorAll('[data-min-role]').forEach(el => {
      const required = RANK[el.getAttribute('data-min-role')] ?? 0;
      if (myRank < required) el.style.display = 'none';
    });
  }
}

async function deleteExpense(id) {
  if (!(await customConfirm('Delete this expense entry?', { danger: true }))) return;
  try {
    await window.firebaseDb.collection('expenses').doc(id).delete();
    showExpToast('Expense deleted.', 'success');
  } catch (err) {
    showExpToast('Failed to delete expense.', 'error');
  }
}
window.deleteExpense = deleteExpense;

/* ─── Monthly total view ────────────────────────────────────────────────── */

function renderMonthSummary() {
  const wrap  = document.getElementById('monthSummaryValue');
  const label = document.getElementById('monthSummaryLabel');
  const byCatWrap = document.getElementById('monthByCategory');
  if (!wrap) return;

  const month = filterMonth || new Date().toISOString().slice(0, 7);
  const inMonth = allExpenses.filter(x => (x.date || '').slice(0, 7) === month);
  const total = inMonth.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const [y, m] = month.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  wrap.textContent = fmtCurrency(total);
  label.textContent = `Total for ${monthLabel} — ${inMonth.length} expense${inMonth.length !== 1 ? 's' : ''}`;

  const byCat = {};
  inMonth.forEach(x => {
    const c = x.category || 'Uncategorised';
    byCat[c] = (byCat[c] || 0) + (Number(x.amount) || 0);
  });
  const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  byCatWrap.innerHTML = cats.length
    ? cats.map(c => `<span class="totals-chip" style="background:rgba(21,128,61,0.08);color:var(--color-primary);margin-right:8px">${escExp(c)}: ${fmtCurrency(byCat[c])}</span>`).join('')
    : `<span style="color:var(--color-text-muted);font-size:13px">No expenses this month.</span>`;
}

/* ─── Export ────────────────────────────────────────────────────────────── */

function exportExpensesCSV() {
  const filtered = getSortedExpenses(getFilteredExpenses());
  const header = ['Date', 'Category', 'Description', 'Amount'];
  const body = filtered.map(x => [x.date || '', x.category || '', x.description || '', Number(x.amount) || 0]);
  const total = filtered.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalsRow = ['TOTAL', '', '', total];
  if (window.downloadCSV) {
    window.downloadCSV([header, ...body, totalsRow], `Expenses-${new Date().toISOString().slice(0,10)}`);
  }
}

function exportExpensesPDF() {
  const filtered = getSortedExpenses(getFilteredExpenses());
  if (window.printExpensesReport) {
    window.printExpensesReport(filtered, {
      categoryLabel: filterCategory === 'all' ? 'All Categories' : filterCategory,
      monthLabel: filterMonth || 'All Dates',
    });
  }
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function fmtExpDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtCurrency(val) {
  const n = Number(val) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showExpToast(msg, type = 'success') {
  let t = document.getElementById('expenseToast');
  if (!t) {
    t = document.createElement('div'); t.id = 'expenseToast';
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

function escExp(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
