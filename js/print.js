/**
 * print.js
 * ─────────────────────────────────────────────
 * Purpose: Browser-based receipt printing for GRN and Issue documents.
 *
 * Exports (attached to window):
 *   printGrnReceipt(grnData)    — prints a Goods Received Note receipt
 *   printIssueReceipt(issData)  — prints a Stock Issue receipt
 *
 * Both functions build a self-contained HTML document and trigger
 * window.print() in a hidden iframe so the main page is undisturbed.
 */

/* ─── Shared helpers ─────────────────────────────────────────────────────── */

function formatDate(dateStr) {
  if (!dateStr) return '—';
  // Handle both ISO date strings ("2026-06-16") and full ISO timestamps
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function buildItemRows(items) {
  if (!items || !items.length) return '<tr><td colspan="5">No items recorded.</td></tr>';
  return items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escRpt(item.category) || '—'}</td>
      <td>${escRpt(item.productName) || '—'}</td>
      <td>${escRpt(item.description) || '—'}</td>
      <td>${item.qty != null ? item.qty : '—'}</td>
    </tr>`).join('');
}

/** Opens a print-ready page in new tab. User taps Print → Save as PDF. Works on all devices. */
function printViaIframe(html) {
  // Inject auto-print script into the HTML
  const printHtml = html.replace('</body>', `
  <script>
    window.onload = function() {
      window.focus();
      setTimeout(function() { window.print(); }, 500);
    };
  <\/script>
  </body>`);

  const blob = new Blob([printHtml], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');

  // If popup blocked, fallback: download HTML file
  if (!win) {
    const a = document.createElement('a');
    a.href     = url;
    a.download = 'stockwise-report.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ─── Receipt shell CSS ──────────────────────────────────────────────────── */

const RECEIPT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 12pt;
    color: #1a1a1a;
    background: #fff;
    padding: 0;
  }
  .receipt {
    width: 100%;
    max-width: 780px;
    margin: 0 auto;
    padding: 32px 40px;
  }

  /* ── Header ── */
  .receipt-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 18px;
    border-bottom: 3px solid #1a1a1a;
    margin-bottom: 22px;
  }
  .company-name {
    font-size: 22pt;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: #1a1a1a;
  }
  .company-sub {
    font-size: 9pt;
    color: #555;
    margin-top: 2px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .doc-title-block {
    text-align: right;
  }
  .doc-type {
    font-size: 18pt;
    font-weight: 700;
    color: #1a1a1a;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .doc-number {
    font-size: 13pt;
    font-weight: 600;
    color: #2563eb;
    margin-top: 4px;
  }
  .doc-status {
    display: inline-block;
    margin-top: 6px;
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .status-in  { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .status-out { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }

  /* ── Meta grid ── */
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 32px;
    margin-bottom: 24px;
    padding: 16px 18px;
    background: #f8f8f6;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
  }
  .meta-row {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 10.5pt;
  }
  .meta-label {
    font-weight: 600;
    color: #444;
    white-space: nowrap;
    min-width: 110px;
  }
  .meta-value {
    color: #1a1a1a;
  }

  /* ── Items table ── */
  .section-title {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #444;
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5pt;
    margin-bottom: 24px;
  }
  thead th {
    background: #1a1a1a;
    color: #fff;
    text-align: left;
    padding: 8px 10px;
    font-size: 9.5pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid #e5e5e5;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  tfoot td {
    padding: 8px 10px;
    font-weight: 700;
    border-top: 2px solid #1a1a1a;
    font-size: 10.5pt;
  }

  /* ── Notes ── */
  .notes-block {
    margin-bottom: 24px;
    padding: 12px 16px;
    border-left: 3px solid #d1d5db;
    background: #f9fafb;
    font-size: 10pt;
    color: #374151;
  }
  .notes-block strong {
    display: block;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  /* ── Signature area ── */
  .sig-area {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
    margin-top: 36px;
    padding-top: 18px;
    border-top: 1px solid #d1d5db;
  }
  .sig-box { font-size: 9.5pt; color: #444; }
  .sig-line {
    height: 40px;
    border-bottom: 1px solid #1a1a1a;
    margin-bottom: 6px;
  }
  .sig-label { color: #6b7280; font-size: 8.5pt; }

  /* ── Footer ── */
  .receipt-footer {
    margin-top: 28px;
    text-align: center;
    font-size: 8.5pt;
    color: #9ca3af;
    border-top: 1px solid #e5e7eb;
    padding-top: 12px;
  }

  @media print {
    body { padding: 0; }
    .receipt { padding: 16px 20px; }
  }
`;

/* ─── GRN Receipt ─────────────────────────────────────────────────────────── */

/**
 * @param {Object} g  — GRN data document from Firestore
 */
window.printGrnReceipt = function(g) {
  const totalItems = (g.items || []).length;
  const totalQty   = (g.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>GRN Receipt — ${g.grnNumber || ''}</title>
  <style>${RECEIPT_STYLES}</style>
</head>
<body>
<div class="receipt">

  <!-- Header -->
  <div class="receipt-header">
    <div>
      <div class="company-name">StockWise</div>
      <div class="company-sub">Warehouse Management System</div>
    </div>
    <div class="doc-title-block">
      <div class="doc-type">Goods Received Note</div>
      <div class="doc-number">${g.grnNumber || '—'}</div>
      <span class="doc-status status-in">Stock In</span>
    </div>
  </div>

  <!-- Meta -->
  <div class="meta-grid">
    <div class="meta-row">
      <span class="meta-label">GRN Number:</span>
      <span class="meta-value"><strong>${g.grnNumber || '—'}</strong></span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Date Received:</span>
      <span class="meta-value">${formatDate(g.date)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Supplier:</span>
      <span class="meta-value">${g.supplier || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Reference / Invoice:</span>
      <span class="meta-value">${g.reference || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Received By:</span>
      <span class="meta-value">${g.createdBy || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Printed:</span>
      <span class="meta-value">${formatDateTime(new Date().toISOString())}</span>
    </div>
  </div>

  <!-- Items -->
  <div class="section-title">Items Received</div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Category</th>
        <th>Product Name</th>
        <th>Description</th>
        <th>Qty Received</th>
      </tr>
    </thead>
    <tbody>
      ${buildItemRows(g.items)}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">Total — ${totalItems} line item${totalItems !== 1 ? 's' : ''}</td>
        <td>${totalQty}</td>
      </tr>
    </tfoot>
  </table>

  ${g.notes ? `
  <div class="notes-block">
    <strong>Notes</strong>
    ${g.notes}
  </div>` : ''}

  <!-- Signatures -->
  <div class="sig-area">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>Received By</div>
      <div class="sig-label">Name &amp; Signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>Checked By</div>
      <div class="sig-label">Name &amp; Signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>Authorised By</div>
      <div class="sig-label">Name &amp; Signature</div>
    </div>
  </div>

  <div class="receipt-footer">
    This is a system-generated Goods Received Note from StockWise WMS &nbsp;·&nbsp;
    ${g.grnNumber || ''} &nbsp;·&nbsp; ${formatDate(g.date)}
  </div>

</div>
</body>
</html>`;

  printViaIframe(html);
};

/* ─── Issue Receipt ───────────────────────────────────────────────────────── */

/**
 * @param {Object} iss  — Issue data document from Firestore
 */
window.printIssueReceipt = function(iss) {
  const totalItems = (iss.items || []).length;
  const totalQty   = (iss.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Issue Receipt — ${iss.issueNumber || ''}</title>
  <style>${RECEIPT_STYLES}</style>
</head>
<body>
<div class="receipt">

  <!-- Header -->
  <div class="receipt-header">
    <div>
      <div class="company-name">StockWise</div>
      <div class="company-sub">Warehouse Management System</div>
    </div>
    <div class="doc-title-block">
      <div class="doc-type">Stock Issue Note</div>
      <div class="doc-number">${iss.issueNumber || '—'}</div>
      <span class="doc-status status-out">Stock Out</span>
    </div>
  </div>

  <!-- Meta -->
  <div class="meta-grid">
    <div class="meta-row">
      <span class="meta-label">Issue Number:</span>
      <span class="meta-value"><strong>${iss.issueNumber || '—'}</strong></span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Date Issued:</span>
      <span class="meta-value">${formatDate(iss.date)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Issued To:</span>
      <span class="meta-value">${iss.issuedTo || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Purpose / Job Ref:</span>
      <span class="meta-value">${iss.purpose || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Issued By:</span>
      <span class="meta-value">${iss.createdBy || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Printed:</span>
      <span class="meta-value">${formatDateTime(new Date().toISOString())}</span>
    </div>
  </div>

  <!-- Items -->
  <div class="section-title">Items Issued</div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Category</th>
        <th>Product Name</th>
        <th>Description</th>
        <th>Qty Issued</th>
      </tr>
    </thead>
    <tbody>
      ${buildItemRows(iss.items)}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">Total — ${totalItems} line item${totalItems !== 1 ? 's' : ''}</td>
        <td>${totalQty}</td>
      </tr>
    </tfoot>
  </table>

  ${iss.notes ? `
  <div class="notes-block">
    <strong>Notes</strong>
    ${iss.notes}
  </div>` : ''}

  <!-- Signatures -->
  <div class="sig-area">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>Issued By</div>
      <div class="sig-label">Name &amp; Signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>Received By</div>
      <div class="sig-label">Name &amp; Signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>Authorised By</div>
      <div class="sig-label">Name &amp; Signature</div>
    </div>
  </div>

  <div class="receipt-footer">
    This is a system-generated Stock Issue Note from StockWise WMS &nbsp;·&nbsp;
    ${iss.issueNumber || ''} &nbsp;·&nbsp; ${formatDate(iss.date)}
  </div>

</div>
</body>
</html>`;

  printViaIframe(html);
};

/* ─── Product Report ──────────────────────────────────────────────────────── */

/**
 * printProductReport(products, opts)
 *
 * @param {Array}  products  — array of product objects from Firestore
 * @param {Object} opts      — optional overrides
 *   opts.title      {string}  — report title, default "Product Stock Report"
 *   opts.filterDesc {string}  — e.g. "Category: PPE" shown under the title
 *   opts.stats      {Object}  — { total, inStock, low, out } stat counts
 */
window.printProductReport = function(products, opts = {}) {
  const title      = opts.title      || 'Product Stock Report';
  const filterDesc = opts.filterDesc || '';
  const stats      = opts.stats      || calcStats(products);
  const now        = formatDateTime(new Date().toISOString());

  /* ── stat summary boxes ── */
  const statBoxes = `
    <div class="rpt-stats">
      <div class="rpt-stat">
        <div class="rpt-stat-val">${stats.total}</div>
        <div class="rpt-stat-lbl">Total Products</div>
      </div>
      <div class="rpt-stat rpt-stat--ok">
        <div class="rpt-stat-val">${stats.inStock}</div>
        <div class="rpt-stat-lbl">In Stock</div>
      </div>
      <div class="rpt-stat rpt-stat--warn">
        <div class="rpt-stat-val">${stats.low}</div>
        <div class="rpt-stat-lbl">Low Stock (≤5)</div>
      </div>
      <div class="rpt-stat rpt-stat--danger">
        <div class="rpt-stat-val">${stats.out}</div>
        <div class="rpt-stat-lbl">Out of Stock</div>
      </div>
    </div>`;

  /* ── product rows ── */
  const rows = products.length
    ? products.map((p, i) => {
        const qty = p.qty != null ? p.qty : 0;
        const statusClass = qty <= 0 ? 'badge-out' : qty <= 5 ? 'badge-low' : 'badge-ok';
        const statusLabel = qty <= 0 ? 'Out of Stock' : qty <= 5 ? 'Low Stock' : 'In Stock';
        return `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${escRpt(p.name)}</strong></td>
            <td>${escRpt(p.category || '—')}</td>
            <td>${p.binLocation ? `<code>${escRpt(p.binLocation)}</code>` : '—'}</td>
            <td class="td-desc">${p.description ? escRpt(p.description.slice(0, 80)) + (p.description.length > 80 ? '…' : '') : '—'}</td>
            <td class="td-qty"><strong>${qty}</strong></td>
            <td><span class="rpt-badge ${statusClass}">${statusLabel}</span></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:#888">No products to display.</td></tr>';

  const REPORT_EXTRA_STYLES = `
    /* ── Report-specific additions ── */
    .rpt-meta-line {
      font-size: 10pt;
      color: #555;
      margin-bottom: 6px;
    }
    .rpt-filter-tag {
      display: inline-block;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      padding: 1px 10px;
      border-radius: 12px;
      font-size: 9pt;
      font-weight: 600;
      margin-left: 6px;
    }
    .rpt-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .rpt-stat {
      text-align: center;
      padding: 12px 8px;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
      background: #f8f8f6;
    }
    .rpt-stat--ok     { background: #f0fdf4; border-color: #86efac; }
    .rpt-stat--warn   { background: #fffbeb; border-color: #fcd34d; }
    .rpt-stat--danger { background: #fef2f2; border-color: #fca5a5; }
    .rpt-stat-val {
      font-size: 22pt;
      font-weight: 800;
      color: #1a1a1a;
      line-height: 1;
    }
    .rpt-stat-lbl {
      font-size: 8.5pt;
      color: #555;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .rpt-badge {
      display: inline-block;
      padding: 2px 9px;
      border-radius: 4px;
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    .badge-ok     { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .badge-low    { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .badge-out    { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    td code {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 9.5pt;
      font-family: 'Courier New', monospace;
    }
    .td-desc  { max-width: 220px; font-size: 10pt; color: #555; }
    .td-qty   { text-align: right; }
    thead th:last-child  { text-align: center; }
    tbody td:last-child  { text-align: center; }
    thead th:nth-child(6){ text-align: right; }

    @media print {
      .rpt-stats { grid-template-columns: repeat(4, 1fr); }
    }
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>${RECEIPT_STYLES}${REPORT_EXTRA_STYLES}</style>
</head>
<body>
<div class="receipt">

  <!-- Header -->
  <div class="receipt-header">
    <div>
      <div class="company-name">StockWise</div>
      <div class="company-sub">Warehouse Management System</div>
    </div>
    <div class="doc-title-block">
      <div class="doc-type">Product Report</div>
      <div class="doc-number" style="font-size:11pt;color:#555;">${now}</div>
    </div>
  </div>

  <!-- Report title + filter tag -->
  <div class="rpt-meta-line">
    <strong style="font-size:12pt">${escRpt(title)}</strong>
    ${filterDesc ? `<span class="rpt-filter-tag">${escRpt(filterDesc)}</span>` : ''}
  </div>

  <!-- Stats -->
  ${statBoxes}

  <!-- Products table -->
  <div class="section-title">Product Inventory (${products.length} item${products.length !== 1 ? 's' : ''})</div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>Product Name</th>
        <th>Category</th>
        <th>Bin</th>
        <th>Description</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5"><strong>Total Stock Units</strong></td>
        <td style="text-align:right"><strong>${products.reduce((s, p) => s + (Number(p.qty) || 0), 0)}</strong></td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="receipt-footer">
    StockWise WMS &nbsp;·&nbsp; Product Stock Report &nbsp;·&nbsp; Generated ${now}
  </div>

</div>
</body>
</html>`;

  printViaIframe(html);
};

/* helpers local to Product Report */
function calcStats(products) {
  const total   = products.length;
  const out     = products.filter(p => (p.qty ?? 0) <= 0).length;
  const low     = products.filter(p => (p.qty ?? 0) > 0 && (p.qty ?? 0) <= 5).length;
  const inStock = total - out - low;
  return { total, inStock, low, out };
}

function escRpt(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


/* ─── History Report (Excel-style, grouped by Category → Product) ────────── */

/** Group records: Category → Product → oldest-to-newest within each product. */
function groupHistoryByCategoryProduct(records) {
  const byCategory = {};
  records.forEach(r => {
    const cat  = r.category    || 'Uncategorised';
    const prod = r.productName || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = {};
    if (!byCategory[cat][prod]) byCategory[cat][prod] = [];
    byCategory[cat][prod].push(r);
  });

  return Object.keys(byCategory).sort((a, b) => a.localeCompare(b)).map(cat => {
    const products = byCategory[cat];
    const items = [];
    Object.keys(products).sort((a, b) => a.localeCompare(b)).forEach(prod => {
      const recs = products[prod].slice().sort((a, b) =>
        new Date(a.createdAt || 0) - new Date(b.createdAt || 0)); // oldest → newest
      items.push(...recs);
    });
    const received = items.filter(d => (d.actionType || '').toLowerCase().includes('receiv'))
      .reduce((s, d) => s + (Number(d.qtyChanged) || 0), 0);
    const issued = items.filter(d => (d.actionType || '').toLowerCase() === 'issued')
      .reduce((s, d) => s + (Number(d.qtyChanged) || 0), 0);
    return { category: cat, items, received, issued };
  });
}

/* ─── Recent Issues / Recent GRNs Report ──────────────────────────────────
   Used by the "PDF" export buttons on the Issue Stock and Receive Stock
   pages — same Excel-style layout as the History report, but grouped by
   document (Issue No. / GRN No.) instead of by category, with a running
   total amount at the bottom.
   ──────────────────────────────────────────────────────────────────────── */
window.printRecentTransactionsReport = function(records, opts = {}) {
  const isGrn        = opts.type === 'grn';
  const docLabel      = isGrn ? 'GRN No.'      : 'Issue No.';
  const docField      = isGrn ? 'grnNumber'    : 'issueNumber';
  const personLabel  = isGrn ? 'Received By'  : 'Issued By';
  const reportTitle  = isGrn ? 'Recent GRNs Report' : 'Recent Issues Report';
  const sign         = isGrn ? '+' : '\u2212';
  const amtColor     = isGrn ? '#166534' : '#991b1b';
  const amtBg        = isGrn ? '#f0fdf4' : '#fef2f2';
  const amtBorder    = isGrn ? '#86efac' : '#fca5a5';

  const now = formatDateTime(new Date().toISOString());

  function escH(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDT(iso) {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  const totalDocs      = records.length;
  const totalLineItems = records.reduce((s, r) => s + (r.items?.length || 0), 0);
  const totalQty       = records.reduce((s, r) =>
    s + (r.items || []).reduce((s2, i) => s2 + (Number(i.qty) || 0), 0), 0);

  const rows = records.length
    ? records.map(r => {
        const docNo   = r[docField] || '\u2014';
        const dateStr = fmtDT(r.createdAt);
        const person  = r.createdBy || '\u2014';
        const items   = r.items || [];
        const docQty  = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

        const headerRow = `<tr class="cat-header-row">
          <td colspan="4">${escH(docNo)} &nbsp;\u00b7&nbsp; ${dateStr} &nbsp;\u00b7&nbsp; ${personLabel}: ${escH(person)}</td>
          <td class="c-num">${sign}${docQty.toLocaleString()}</td>
        </tr>`;

        const itemRows = items.length ? items.map((it, i) => `
          <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f7f8fa'}">
            <td class="c-cat">${escH(it.category || '\u2014')}</td>
            <td class="c-prod" colspan="2">${escH(it.productName || '\u2014')}</td>
            <td class="c-desc">${escH((it.description || '\u2014').slice(0, 70))}</td>
            <td class="c-num">${it.qty != null ? it.qty.toLocaleString() : '\u2014'}</td>
          </tr>`).join('')
          : `<tr><td colspan="5" style="color:#888">No line items recorded.</td></tr>`;

        return headerRow + itemRows;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:16px;color:#888">No records.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${reportTitle}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:10pt; color:#111; background:#fff; }
  .page { width:100%; max-width:1050px; margin:0 auto; padding:20px 24px; }

  .rpt-header { display:flex; justify-content:space-between; align-items:flex-end;
    border-bottom:3px solid #111; padding-bottom:10px; margin-bottom:14px; }
  .rpt-co { font-size:18pt; font-weight:800; letter-spacing:-.5px; }
  .rpt-co-sub { font-size:8pt; color:#555; text-transform:uppercase; letter-spacing:.5px; margin-top:1px; }
  .rpt-title-blk { text-align:right; }
  .rpt-title { font-size:12pt; font-weight:700; }
  .rpt-ts { font-size:8.5pt; color:#666; margin-top:2px; }

  .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
  .s-box { border:1px solid #d1d5db; border-radius:3px; padding:8px 10px; text-align:center; }
  .s-val { font-size:16pt; font-weight:800; line-height:1; }
  .s-lbl { font-size:7.5pt; color:#555; margin-top:3px; text-transform:uppercase; letter-spacing:.4px; }
  .s-box.s-amt { background:${amtBg}; border-color:${amtBorder}; }

  table { width:100%; border-collapse:collapse; font-size:9pt; }
  thead th {
    background:#1e3a5f; color:#fff; padding:6px 8px;
    text-align:left; font-size:8pt; font-weight:700;
    text-transform:uppercase; letter-spacing:.4px;
    border:1px solid #1e3a5f; white-space:nowrap;
  }
  thead th.c-num { text-align:right; }
  tbody td { padding:5px 8px; border:1px solid #d1d5db; vertical-align:middle; }
  tbody td.c-num  { text-align:right; font-variant-numeric:tabular-nums; }
  tbody td.c-prod { font-weight:600; }
  tbody td.c-desc { color:#555; font-size:8.5pt; max-width:220px; }
  tbody td.c-cat  { color:#444; }

  tfoot td { padding:6px 8px; border:1px solid #d1d5db; font-weight:700;
    background:#1e3a5f; color:#fff; font-size:9pt; }
  tfoot td.c-num { text-align:right; }

  tbody tr.cat-header-row td {
    background:#eff6ff; color:#1e3a5f; font-weight:700; font-size:8.5pt;
    padding:6px 8px; border:1px solid #bfdbfe;
  }
  tbody tr.cat-header-row td.c-num { text-align:right; color:${amtColor}; }

  .rpt-footer { margin-top:16px; padding-top:8px; border-top:1px solid #e5e7eb;
    font-size:8pt; color:#9ca3af; text-align:center; }

  @page { size:A4 landscape; margin:12mm 14mm; }
  @media print {
    body { font-size:9pt; }
    .page { padding:0; }
    thead { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tfoot { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tbody tr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="rpt-header">
    <div>
      <div class="rpt-co">StockWise</div>
      <div class="rpt-co-sub">Warehouse Management System</div>
    </div>
    <div class="rpt-title-blk">
      <div class="rpt-title">${reportTitle}</div>
      <div class="rpt-ts">Printed: ${now}</div>
    </div>
  </div>

  <div class="summary">
    <div class="s-box">
      <div class="s-val">${totalDocs}</div>
      <div class="s-lbl">${docLabel.replace(' No.', 's')}</div>
    </div>
    <div class="s-box">
      <div class="s-val">${totalLineItems}</div>
      <div class="s-lbl">Line Items</div>
    </div>
    <div class="s-box s-amt">
      <div class="s-val" style="color:${amtColor}">${sign}${totalQty.toLocaleString()}</div>
      <div class="s-lbl">Total Qty Amount</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c-cat">Category</th>
        <th class="c-prod" colspan="2">Product</th>
        <th class="c-desc">Description</th>
        <th class="c-num">Qty</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">TOTAL \u2014 ${totalDocs} document${totalDocs !== 1 ? 's' : ''}, ${totalLineItems} line item${totalLineItems !== 1 ? 's' : ''}</td>
        <td class="c-num">${sign}${totalQty.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>

  <div class="rpt-footer">
    StockWise WMS &nbsp;\u00b7&nbsp; ${reportTitle} &nbsp;\u00b7&nbsp; ${now}
  </div>
</div>
</body>
</html>`;

  printViaIframe(html);
};

window.printHistoryReport = function(records, meta = {}) {
  const now         = formatDateTime(new Date().toISOString());
  const actionLabel = meta.actionLabel || 'All Transactions';
  const rangeLabel  = meta.rangeLabel  || 'All Dates';

  // Totals
  const totalReceived = records.filter(r => (r.actionType||'').toLowerCase().includes('receiv'))
                               .reduce((s,r) => s+(Number(r.qtyChanged)||0), 0);
  const totalIssued   = records.filter(r => (r.actionType||'').toLowerCase() === 'issued')
                               .reduce((s,r) => s+(Number(r.qtyChanged)||0), 0);
  const totalStockOut = records.filter(r => (r.actionType||'').toLowerCase() === 'stock out').length;

  function escH(str) {
    return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDT(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function fmtN(val) {
    const n = Number(val); return isNaN(n) ? (val||'—') : n.toLocaleString();
  }

  const groups = groupHistoryByCategoryProduct(records);

  const rows = records.length
    ? groups.map(group => {
        const catHeaderRow = `<tr class="cat-header-row">
          <td colspan="7">${escH(group.category)}</td>
        </tr>`;

        const itemRows = group.items.map((d, i) => {
          const action   = d.actionType || '—';
          const isRcv    = action.toLowerCase().includes('receiv');
          const isOut    = action.toLowerCase() === 'stock out';
          const isIss    = action.toLowerCase() === 'issued';
          const txColor  = isRcv ? '#166534' : isOut ? '#92400e' : isIss ? '#991b1b' : '#374151';
          const txBg     = isRcv ? '#dcfce7'  : isOut ? '#fef3c7' : isIss ? '#fee2e2' : '#f3f4f6';
          const qty      = d.qtyChanged != null ? fmtN(d.qtyChanged) : '—';
          const stAfter  = d.stockAfter  != null ? fmtN(d.stockAfter)  : '—';
          const rowBg    = i % 2 === 0 ? '#ffffff' : '#f7f8fa';
          return `<tr style="background:${rowBg}">
            <td class="c-date">${fmtDT(d.createdAt)}</td>
            <td class="c-cat">${escH(d.category||'—')}</td>
            <td class="c-prod">${escH(d.productName||'—')}</td>
            <td class="c-tx"><span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:${txColor};background:${txBg};border:1px solid ${txBg}">${escH(action)}</span></td>
            <td class="c-num">${qty}</td>
            <td class="c-num">${stAfter}</td>
            <td class="c-desc">${escH((d.description||'—').slice(0,70))}</td>
          </tr>`;
        }).join('');

        const subtotalRow = `<tr class="cat-subtotal-row">
          <td colspan="4">${escH(group.category)} subtotal — ${group.items.length} record${group.items.length!==1?'s':''}</td>
          <td class="c-num" colspan="3">Rcv: +${group.received.toLocaleString()} &nbsp;|&nbsp; Iss: −${group.issued.toLocaleString()}</td>
        </tr>`;

        return catHeaderRow + itemRows + subtotalRow;
      }).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:16px;color:#888">No records.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Transaction History Report</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:10pt; color:#111; background:#fff; }
  .page { width:100%; max-width:1050px; margin:0 auto; padding:20px 24px; }

  /* ── Header block ── */
  .rpt-header { display:flex; justify-content:space-between; align-items:flex-end;
    border-bottom:3px solid #111; padding-bottom:10px; margin-bottom:14px; }
  .rpt-co { font-size:18pt; font-weight:800; letter-spacing:-.5px; }
  .rpt-co-sub { font-size:8pt; color:#555; text-transform:uppercase; letter-spacing:.5px; margin-top:1px; }
  .rpt-title-blk { text-align:right; }
  .rpt-title { font-size:12pt; font-weight:700; }
  .rpt-ts { font-size:8.5pt; color:#666; margin-top:2px; }

  /* ── Meta tags ── */
  .rpt-meta { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; font-size:9pt; }
  .meta-tag { background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8;
    padding:2px 10px; border-radius:3px; font-weight:600; }

  /* ── Summary boxes ── */
  .summary { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:14px; }
  .s-box { border:1px solid #d1d5db; border-radius:3px; padding:8px 10px; text-align:center; }
  .s-val { font-size:16pt; font-weight:800; line-height:1; }
  .s-lbl { font-size:7.5pt; color:#555; margin-top:3px; text-transform:uppercase; letter-spacing:.4px; }
  .s-box.s-green { background:#f0fdf4; border-color:#86efac; }
  .s-box.s-red   { background:#fef2f2; border-color:#fca5a5; }
  .s-box.s-amber { background:#fffbeb; border-color:#fcd34d; }

  /* ── Excel-style table ── */
  table { width:100%; border-collapse:collapse; font-size:9pt; }
  thead th {
    background:#1e3a5f; color:#fff; padding:6px 8px;
    text-align:left; font-size:8pt; font-weight:700;
    text-transform:uppercase; letter-spacing:.4px;
    border:1px solid #1e3a5f; white-space:nowrap;
  }
  thead th.c-num { text-align:right; }
  tbody td { padding:5px 8px; border:1px solid #d1d5db; vertical-align:middle; }
  tbody td.c-num   { text-align:right; font-variant-numeric:tabular-nums; }
  tbody td.c-date  { white-space:nowrap; color:#555; font-size:8.5pt; }
  tbody td.c-prod  { font-weight:600; }
  tbody td.c-desc  { color:#555; font-size:8.5pt; max-width:180px; }
  tbody td.c-cat   { color:#444; }

  /* ── Totals row ── */
  tfoot td { padding:6px 8px; border:1px solid #d1d5db; font-weight:700;
    background:#1e3a5f; color:#fff; font-size:9pt; }
  tfoot td.c-num { text-align:right; }

  /* ── Category group rows ── */
  tbody tr.cat-header-row td {
    background:#1e3a5f; color:#fff; font-weight:700;
    text-transform:uppercase; letter-spacing:.4px; font-size:9pt;
    padding:6px 8px; border:1px solid #1e3a5f;
  }
  tbody tr.cat-subtotal-row td {
    background:#eff6ff; color:#1e3a5f; font-weight:700; font-size:8.5pt;
    padding:5px 8px; border:1px solid #bfdbfe;
  }
  tbody tr.cat-subtotal-row td.c-num { text-align:right; }

  /* ── Footer ── */
  .rpt-footer { margin-top:16px; padding-top:8px; border-top:1px solid #e5e7eb;
    font-size:8pt; color:#9ca3af; text-align:center; }

  @page { size:A4 landscape; margin:12mm 14mm; }
  @media print {
    body { font-size:9pt; }
    .page { padding:0; }
    .summary { grid-template-columns:repeat(5,1fr); }
    thead { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tfoot { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tbody tr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="rpt-header">
    <div>
      <div class="rpt-co">StockWise</div>
      <div class="rpt-co-sub">Warehouse Management System</div>
    </div>
    <div class="rpt-title-blk">
      <div class="rpt-title">Transaction History Report</div>
      <div class="rpt-ts">Printed: ${now}</div>
    </div>
  </div>

  <div class="rpt-meta">
    <span>Period: <span class="meta-tag">${escH(rangeLabel)}</span></span>
    <span>Filter: <span class="meta-tag">${escH(actionLabel)}</span></span>
    ${meta.searchQuery ? `<span>Search: <span class="meta-tag">${escH(meta.searchQuery)}</span></span>` : ''}
  </div>

  <div class="summary">
    <div class="s-box">
      <div class="s-val">${records.length}</div>
      <div class="s-lbl">Total Records</div>
    </div>
    <div class="s-box s-green">
      <div class="s-val" style="color:#166534">${records.filter(r=>(r.actionType||'').toLowerCase().includes('receiv')).length}</div>
      <div class="s-lbl">GRN Entries</div>
    </div>
    <div class="s-box s-green">
      <div class="s-val" style="color:#166534">+${totalReceived.toLocaleString()}</div>
      <div class="s-lbl">Total Received Qty</div>
    </div>
    <div class="s-box s-red">
      <div class="s-val" style="color:#991b1b">−${totalIssued.toLocaleString()}</div>
      <div class="s-lbl">Total Issued Qty</div>
    </div>
    <div class="s-box s-amber">
      <div class="s-val" style="color:#92400e">${totalStockOut}</div>
      <div class="s-lbl">Stock Out Events</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c-date">Date &amp; Time</th>
        <th class="c-cat">Category</th>
        <th class="c-prod">Product</th>
        <th class="c-tx">Transaction</th>
        <th class="c-num">Qty Changed</th>
        <th class="c-num">Stock After</th>
        <th class="c-desc">Description</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">TOTALS — ${records.length} record${records.length!==1?'s':''}</td>
        <td class="c-num">Rcv: +${totalReceived.toLocaleString()} &nbsp;|&nbsp; Iss: −${totalIssued.toLocaleString()}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>

  <div class="rpt-footer">
    StockWise WMS &nbsp;·&nbsp; Transaction History &nbsp;·&nbsp; ${now}
  </div>
</div>
</body>
</html>`;

  printViaIframe(html);
};
