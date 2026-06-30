/**
 * history.js
 * Columns: Date/Time | Category | Product | Transaction | Qty Changed | Stock After | Description
 * Grouped by Category → Product (oldest → newest within each product), with a
 * subtotal row per category and an overall total row at the bottom.
 * Filters: action type, date range (Today/Week/Month/Year/Custom)
 * Print: Excel-style structured report, grouped the same way
 */

const db = () => window.firebaseDb;

let allRecords   = [];
let unsubscribe  = null;
let searchQuery  = '';
let filterAction = 'all';
let filterDate   = 'all';
let dateFrom     = null;
let dateTo       = null;

document.addEventListener('DOMContentLoaded', () => {
  wireControls();
  startListener();
});

function startListener() {
  const tbody = document.getElementById('historyBody');

  // Skeleton rows while loading
  tbody.innerHTML = Array(6).fill(0).map(() => `
    <tr class="skeleton-row">
      <td><span class="skeleton skeleton-text" style="width:110px"></span></td>
      <td><span class="skeleton skeleton-text" style="width:70px"></span></td>
      <td><span class="skeleton skeleton-text" style="width:120px"></span></td>
      <td><span class="skeleton skeleton-pill"></span></td>
      <td><span class="skeleton skeleton-text" style="width:40px;margin-left:auto"></span></td>
      <td><span class="skeleton skeleton-text" style="width:40px;margin-left:auto"></span></td>
      <td><span class="skeleton skeleton-text" style="width:150px"></span></td>
    </tr>`).join('');

  if (unsubscribe) unsubscribe();
  unsubscribe = db()
    .collection('history')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      snap => {
        allRecords = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
      },
      err => {
        console.error('history onSnapshot error:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:var(--color-danger)">Failed to load history.</td></tr>`;
      }
    );
}

function wireControls() {
  const searchInput   = document.getElementById('historySearch');
  const actionFilter  = document.getElementById('historyActionFilter');
  const clearBtn      = document.getElementById('clearSearch');
  const dateRangeSel  = document.getElementById('historyDateRange');
  const customWrap    = document.getElementById('customDateWrap');
  const dateFromInput = document.getElementById('dateFrom');
  const dateToInput   = document.getElementById('dateTo');
  const printBtn      = document.getElementById('printHistoryBtn');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', searchQuery === '');
    renderTable();
  });
  actionFilter.addEventListener('change', () => { filterAction = actionFilter.value; renderTable(); });
  clearBtn.addEventListener('click', () => {
    searchInput.value = ''; searchQuery = '';
    clearBtn.classList.add('hidden'); renderTable();
  });
  dateRangeSel.addEventListener('change', () => {
    filterDate = dateRangeSel.value;
    customWrap.classList.toggle('hidden', filterDate !== 'custom');
    if (filterDate !== 'custom') { dateFrom = null; dateTo = null; }
    renderTable();
  });
  dateFromInput.addEventListener('change', () => {
    dateFrom = dateFromInput.value ? new Date(dateFromInput.value + 'T00:00:00') : null;
    renderTable();
  });
  dateToInput.addEventListener('change', () => {
    dateTo = dateToInput.value ? new Date(dateToInput.value + 'T23:59:59') : null;
    renderTable();
  });
  printBtn.addEventListener('click', () => {
    printHistoryReport(getFiltered(), buildPrintMeta());
  });
}

function getDateBounds() {
  const now = new Date();
  const start = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end   = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  switch (filterDate) {
    case 'today':  return { from: start(now), to: end(now) };
    case 'week': {
      const day = now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: start(mon), to: end(sun) };
    }
    case 'month':  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59) };
    case 'year':   return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
    case 'custom': return { from: dateFrom, to: dateTo };
    default:       return { from: null, to: null };
  }
}

function getFiltered() {
  const { from, to } = getDateBounds();
  return allRecords.filter(d => {
    const matchesAction = filterAction === 'all' || (d.actionType || '').toLowerCase() === filterAction.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      (d.productName || '').toLowerCase().includes(searchQuery) ||
      (d.category    || '').toLowerCase().includes(searchQuery) ||
      (d.description || '').toLowerCase().includes(searchQuery) ||
      (d.actionType  || '').toLowerCase().includes(searchQuery);
    let matchesDate = true;
    if (from || to) {
      const ts = d.createdAt ? new Date(d.createdAt) : null;
      if (!ts) matchesDate = false;
      else {
        if (from && ts < from) matchesDate = false;
        if (to   && ts > to)   matchesDate = false;
      }
    }
    return matchesAction && matchesSearch && matchesDate;
  });
}

function buildPrintMeta() {
  const actionLabel = { all:'All Transactions', Received:'Received (GRN)', Issued:'Issued', 'Stock Out':'Stock Out' }[filterAction] || 'All';
  const rangeLabel  = { all:'All Dates', today:'Today', week:'This Week', month:'This Month', year:'This Year',
    custom: (() => {
      const f = document.getElementById('dateFrom').value;
      const t = document.getElementById('dateTo').value;
      return [f,t].filter(Boolean).join(' — ') || 'Custom';
    })()
  }[filterDate] || 'All Dates';
  return { actionLabel, rangeLabel, searchQuery };
}

/* ── Group filtered records: Category → Product → oldest-to-newest ── */
function groupByCategoryProduct(records) {
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

function renderTable() {
  const tbody    = document.getElementById('historyBody');
  const tfoot    = document.getElementById('historyFoot');
  const empty    = document.getElementById('historyEmpty');
  const count    = document.getElementById('historyCount');
  const filtered = getFiltered();

  count.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (tfoot) tfoot.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const groups = groupByCategoryProduct(filtered);

  // Overall totals
  const totalReceived = filtered.filter(d => (d.actionType||'').toLowerCase().includes('receiv'))
                                .reduce((s,d) => s + (Number(d.qtyChanged)||0), 0);
  const totalIssued   = filtered.filter(d => (d.actionType||'').toLowerCase() === 'issued')
                                .reduce((s,d) => s + (Number(d.qtyChanged)||0), 0);

  tbody.innerHTML = groups.map(group => {
    const catRow = `<tr class="history-category-row">
      <td colspan="7">${escapeHtml(group.category)}</td>
    </tr>`;

    const itemRows = group.items.map(d => {
      const action = d.actionType || '—';
      const badgeClass =
        action.toLowerCase().includes('receiv')    ? 'tx-badge--in'      :
        action.toLowerCase() === 'stock out'       ? 'tx-badge--stockout':
        action.toLowerCase().includes('issue')     ? 'tx-badge--out'     :
        'tx-badge--neutral';
      const desc = d.description || '—';
      const qtyDisplay = d.qtyChanged != null ? fmtNum(d.qtyChanged) : '—';
      const stockAfterDisplay = d.stockAfter != null ? fmtNum(d.stockAfter) : '—';

      return `<tr>
        <td class="date-cell">${formatDateTime(d.createdAt)}</td>
        <td>${escapeHtml(d.category || '—')}</td>
        <td class="product-cell">${escapeHtml(d.productName || '—')}</td>
        <td><span class="tx-badge ${badgeClass}">${escapeHtml(action)}</span></td>
        <td class="num-cell">${qtyDisplay}</td>
        <td class="num-cell">${stockAfterDisplay}</td>
        <td class="td-desc" title="${escapeHtml(desc)}">${escapeHtml(desc.length > 50 ? desc.slice(0,50)+'…' : desc)}</td>
      </tr>`;
    }).join('');

    const subtotalRow = `<tr class="history-category-subtotal-row">
      <td colspan="4" class="totals-label">${escapeHtml(group.category)} subtotal — ${group.items.length} record${group.items.length!==1?'s':''}:</td>
      <td colspan="3" class="num-cell totals-num">
        <span class="totals-chip totals-chip--in">+${fmtNum(group.received)} rcv</span>
        <span class="totals-chip totals-chip--out">−${fmtNum(group.issued)} iss</span>
      </td>
    </tr>`;

    return catRow + itemRows + subtotalRow;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr class="history-totals-row">
      <td colspan="4" class="totals-label">Grand total for ${filtered.length} record${filtered.length!==1?'s':''}:</td>
      <td class="num-cell totals-num">
        <span class="totals-chip totals-chip--in">+${fmtNum(totalReceived)} rcv</span>
        <span class="totals-chip totals-chip--out">−${fmtNum(totalIssued)} iss</span>
      </td>
      <td colspan="2"></td>
    </tr>`;
  }
}

function fmtNum(val) {
  const n = Number(val);
  return isNaN(n) ? val : n.toLocaleString();
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit',
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
