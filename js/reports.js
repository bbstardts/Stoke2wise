/**
 * reports.js — Monthly Stock Consumption Report
 * ─────────────────────────────────────────────
 * Reads /transactions (type: 'issue') for the selected month, filtering in
 * JS (same "no composite index required" approach as dashboard.js), then
 * aggregates total quantity issued per product, broken down by department.
 *
 * Exports:
 *   PDF — via window.printConsumptionReport (print.js)
 *   CSV — via window.downloadCSV (print.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  const db = window.firebaseDb;

  const monthInput   = document.getElementById('reportMonth');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const thead        = document.getElementById('consumptionThead');
  const tbody        = document.getElementById('consumptionBody');
  const tableTitle    = document.getElementById('reportTableTitle');
  const usageRanking  = document.getElementById('usageRanking');
  const usageToggle   = document.getElementById('usageToggle');

  let currentReport = null; // last computed { monthLabel, departments, rows, deptTotals, grandTotal }
  let usageMode = 'most'; // 'most' | 'least'

  // Default to the current month.
  const now = new Date();
  monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  monthInput.addEventListener('change', () => loadReport());
  exportCsvBtn.addEventListener('click', () => exportCSV());
  exportPdfBtn.addEventListener('click', () => exportPDF());

  usageToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.usage-toggle-btn');
    if (!btn) return;
    usageMode = btn.dataset.mode;
    usageToggle.querySelectorAll('.usage-toggle-btn').forEach(b =>
      b.classList.toggle('is-active', b === btn));
    if (currentReport) renderUsageRanking(currentReport);
  });

  loadReport();

  async function loadReport() {
    const monthVal = monthInput.value; // "YYYY-MM"
    if (!monthVal) return;

    setLoading();

    const [year, month] = monthVal.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd   = new Date(year, month, 1); // exclusive
    const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    try {
      // Single simple query — filter/aggregate in JS, matching the rest of the app.
      const snap = await db.collection('transactions').where('type', '==', 'issue').get();

      const issuesInMonth = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => {
          const dt = new Date(t.createdAt || 0);
          return dt >= monthStart && dt < monthEnd;
        });

      currentReport = buildConsumptionData(issuesInMonth, monthLabel);
      renderReport(currentReport);
    } catch (err) {
      console.error('Failed to load consumption report:', err);
      tbody.innerHTML = `<tr><td colspan="3" class="table-empty">Failed to load: ${esc(err.message)}</td></tr>`;
      usageRanking.innerHTML = `<div class="chart-empty">Failed to load: ${esc(err.message)}</div>`;
      currentReport = null;
      exportCsvBtn.disabled = true;
      exportPdfBtn.disabled = true;
    }
  }

  /**
   * Aggregates a list of issue transactions into:
   *   { monthLabel, departments, rows, deptTotals, grandTotal }
   * rows: [{ category, productName, byDept: {dept: qty}, total }], sorted by
   * category then product name.
   */
  function buildConsumptionData(issues, monthLabel) {
    const departmentSet = new Set();
    // key: category|productName -> { category, productName, byDept, total }
    const productMap = {};

    issues.forEach(t => {
      const dept = t.department || 'Unassigned';
      departmentSet.add(dept);
      (t.items || []).forEach(item => {
        const category = item.category || 'Uncategorised';
        const name     = item.productName || 'Unknown';
        const key      = category + '|' + name;
        const qty      = Number(item.qty) || 0;

        if (!productMap[key]) {
          productMap[key] = { category, productName: name, byDept: {}, total: 0 };
        }
        productMap[key].byDept[dept] = (productMap[key].byDept[dept] || 0) + qty;
        productMap[key].total += qty;
      });
    });

    const departments = [...departmentSet].sort((a, b) => a.localeCompare(b));

    const rows = Object.values(productMap).sort((a, b) =>
      a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName)
    );

    const deptTotals = {};
    departments.forEach(d => {
      deptTotals[d] = rows.reduce((s, r) => s + (r.byDept[d] || 0), 0);
    });

    const grandTotal = rows.reduce((s, r) => s + r.total, 0);

    return { monthLabel, departments, rows, deptTotals, grandTotal };
  }

  function renderReport(data) {
    document.getElementById('statProducts').textContent    = data.rows.length;
    document.getElementById('statDepartments').textContent = data.departments.length;
    document.getElementById('statTotalQty').textContent    = data.grandTotal.toLocaleString();
    tableTitle.textContent = `Consumption by Product & Department — ${data.monthLabel}`;

    renderUsageRanking(data);

    // Header row: Category, Product, one column per department, Total.
    thead.innerHTML = `<tr>
      <th>Category</th>
      <th>Product</th>
      ${data.departments.map(d => `<th class="dept-col-head">${esc(d)}</th>`).join('')}
      <th class="dept-col-head">Total</th>
    </tr>`;

    if (data.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${data.departments.length + 3}" class="table-empty">No stock was issued in ${esc(data.monthLabel)}.</td></tr>`;
      exportCsvBtn.disabled = true;
      exportPdfBtn.disabled = true;
      return;
    }

    tbody.innerHTML = data.rows.map(r => `
      <tr>
        <td><span class="cat-badge">${esc(r.category)}</span></td>
        <td>${esc(r.productName)}</td>
        ${data.departments.map(d => `<td class="dept-col-cell">${(r.byDept[d] || 0) ? r.byDept[d].toLocaleString() : '—'}</td>`).join('')}
        <td class="total-col-cell">${r.total.toLocaleString()}</td>
      </tr>`).join('');

    exportCsvBtn.disabled = false;
    exportPdfBtn.disabled = false;
  }

  /**
   * Renders the Product Usage Ranking panel — top N products by total qty
   * issued this month, most-used or least-used depending on usageMode.
   * Reuses the same aggregated `rows` the consumption table already has,
   * so no extra Firestore reads are needed.
   */
  function renderUsageRanking(data) {
    if (!data.rows.length) {
      usageRanking.innerHTML = `<div class="chart-empty">No stock was issued in ${esc(data.monthLabel)}.</div>`;
      return;
    }

    const LIMIT = 10;
    const sorted = [...data.rows].sort((a, b) =>
      usageMode === 'most' ? b.total - a.total : a.total - b.total
    );
    const top = sorted.slice(0, LIMIT);
    const maxQty = Math.max(...top.map(r => r.total), 1);
    const barClass = usageMode === 'least' ? 'usage-bar--least' : '';

    usageRanking.innerHTML = top.map((r, i) => {
      const pct = Math.max((r.total / maxQty) * 100, 3); // 3% floor so tiny bars stay visible
      return `
      <div class="usage-row">
        <span class="usage-rank">${i + 1}</span>
        <span class="usage-name" title="${esc(r.productName)}">${esc(r.productName)}</span>
        <span class="usage-bar-track">
          <span class="usage-bar-fill ${barClass}" style="width:${pct}%"></span>
        </span>
        <span class="usage-qty">${r.total.toLocaleString()}</span>
      </div>`;
    }).join('');
  }

  function setLoading() {
    tbody.innerHTML = `<tr><td colspan="3" class="table-loading">Loading…</td></tr>`;
    usageRanking.innerHTML = `<div class="chart-empty">Loading…</div>`;
    exportCsvBtn.disabled = true;
    exportPdfBtn.disabled = true;
  }

  function exportPDF() {
    if (!currentReport || typeof window.printConsumptionReport !== 'function') return;
    window.printConsumptionReport(currentReport);
  }

  function exportCSV() {
    if (!currentReport || typeof window.downloadCSV !== 'function') return;
    const { monthLabel, departments, rows, deptTotals, grandTotal } = currentReport;

    const header = ['Category', 'Product', ...departments, 'Total'];
    const body = rows.map(r => [
      r.category,
      r.productName,
      ...departments.map(d => r.byDept[d] || 0),
      r.total,
    ]);
    const totalsRow = ['TOTAL', '', ...departments.map(d => deptTotals[d] || 0), grandTotal];

    window.downloadCSV([header, ...body, totalsRow], `Consumption-Report-${monthLabel.replace(/[^a-z0-9]+/gi, '-')}`);
  }

  function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
});
