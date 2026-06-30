/**
 * dashboard.js — No composite indexes required.
 * Fetches all transactions and filters/sorts in JavaScript.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const db = window.firebaseDb;

  document.getElementById('currentDate').textContent =
    new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  document.getElementById('refreshBtn').addEventListener('click', () => loadAll());
  loadAll();

  function skeletonRows(cols, count = 4) {
    return Array(count).fill(0).map(() =>
      `<tr>${Array(cols).fill(0).map(() =>
        `<td><span class="skeleton" style="display:block;height:12px;border-radius:4px;width:${60+Math.random()*30|0}%"></span></td>`
      ).join('')}</tr>`
    ).join('');
  }

  async function loadAll() {
    // Show skeletons immediately before any fetch
    document.getElementById('recentGrnBody').innerHTML   = skeletonRows(5);
    document.getElementById('recentIssueBody').innerHTML = skeletonRows(5);
    document.getElementById('lowStockBody').innerHTML    = skeletonRows(3, 3);
    document.getElementById('activityFeed').innerHTML    = Array(4).fill(0).map(() =>
      `<li class="activity-item">
        <span class="activity-dot" style="background:#e5e7eb"></span>
        <div class="activity-body">
          <span class="skeleton" style="display:block;height:12px;border-radius:4px;width:70%;margin-bottom:6px"></span>
          <span class="skeleton" style="display:block;height:10px;border-radius:4px;width:40%"></span>
        </div>
      </li>`).join('');

    // Load sequentially so skeletons don't get re-applied after data loads
    await loadProductKPIs();
    await loadTransactions();
  }

  // ── Products: KPIs + Out of Stock table ─────────────────────────────────
  async function loadProductKPIs() {
    try {
      const snap = await db.collection('products').get();
      let totalQty = 0, outCount = 0;
      snap.forEach(doc => {
        const p = doc.data();
        totalQty += Number(p.qty) || 0;
        if ((p.qty ?? 0) <= 0) outCount++;
      });
      setKPI('totalProducts', snap.size);
      setKPI('totalStockQty', totalQty.toLocaleString());
      setKPI('lowStockCount', outCount);
      renderLowStockTable(snap.docs);
    } catch (err) {
      console.error('Dashboard product KPIs failed to load:', err);
      ['totalProducts','totalStockQty','lowStockCount'].forEach(id => setKPI(id, 'Err'));
      document.getElementById('lowStockBody').innerHTML =
        emptyRow(3, 'Failed to load: ' + err.message);
    }
  }

  // ── All transactions: fetch once, filter in JS ───────────────────────────
  async function loadTransactions() {
    const grnBody    = document.getElementById('recentGrnBody');
    const issueBody  = document.getElementById('recentIssueBody');
    const feed       = document.getElementById('activityFeed');

    try {
      // Single simple query — no index needed
      const snap = await db.collection('transactions').limit(50).get();

      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Sort by createdAt descending in JS
      docs.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const db_ = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return db_ - da;
      });

      const grns   = docs.filter(d => d.type === 'grn');
      const issues = docs.filter(d => d.type === 'issue');

      // ── Issued Today KPI ──
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      let issuedToday = 0;
      issues.forEach(d => {
        const dt = new Date(d.createdAt || 0);
        if (dt >= todayStart) {
          (d.items || []).forEach(i => { issuedToday += Number(i.qty) || 0; });
        }
      });
      setKPI('issuedToday', issuedToday);

      // ── Recent GRN table ──
      if (grns.length === 0) {
        grnBody.innerHTML = emptyRow(5, 'No GRN records yet.');
      } else {
        grnBody.innerHTML = grns.slice(0, 5).map(t => {
          const first    = (t.items || [])[0] || {};
          const more     = (t.items||[]).length > 1 ? ` +${t.items.length-1} more` : '';
          const totalQty = (t.items||[]).reduce((s,i) => s+(Number(i.qty)||0), 0);
          return `<tr>
            <td>${esc(first.productName||'—')}${more}</td>
            <td class="cell-muted">${esc(first.description||'—')}</td>
            <td><span class="qty-badge qty-badge--in">+${totalQty}</span></td>
            <td>${formatDate(t.createdAt)}</td>
            <td class="ref-cell">${esc(t.grnNumber||'—')}</td>
          </tr>`;
        }).join('');
      }

      // ── Recent Issues table ──
      if (issues.length === 0) {
        issueBody.innerHTML = emptyRow(5, 'No issue records yet.');
      } else {
        issueBody.innerHTML = issues.slice(0, 5).map(t => {
          const first    = (t.items||[])[0] || {};
          const more     = (t.items||[]).length > 1 ? ` +${t.items.length-1} more` : '';
          const totalQty = (t.items||[]).reduce((s,i) => s+(Number(i.qty)||0), 0);
          return `<tr>
            <td>${esc(first.productName||'—')}${more}</td>
            <td class="cell-muted">${esc(first.description||'—')}</td>
            <td><span class="qty-badge qty-badge--out">−${totalQty}</span></td>
            <td>${formatDate(t.createdAt)}</td>
            <td class="ref-cell">${esc(t.issueNumber||'—')}</td>
          </tr>`;
        }).join('');
      }

      // ── Activity Feed ──
      if (docs.length === 0) {
        feed.innerHTML = `<li class="activity-item"><span class="activity-loading">No transactions yet.</span></li>`;
      } else {
        feed.innerHTML = docs.slice(0, 10).map(t => {
          const isIn     = t.type === 'grn';
          const items    = t.items || [];
          const first    = items[0] || {};
          const totalQty = items.reduce((s,i) => s+(Number(i.qty)||0), 0);
          const more     = items.length > 1 ? ` +${items.length-1} more` : '';
          const ref      = t.grnNumber || t.issueNumber || '';
          const desc     = first.description ? ` — ${esc(first.description)}` : '';
          return `<li class="activity-item">
            <span class="activity-dot activity-dot--${isIn?'in':'out'}"></span>
            <div class="activity-body">
              <span class="activity-text">
                <strong>${esc(first.productName||'Unknown')}</strong>${more}${desc}
                — ${isIn ? 'received' : 'issued'}
                <span class="qty-badge qty-badge--${isIn?'in':'out'}" style="font-size:11px">
                  ${isIn?'+':'−'}${totalQty}
                </span>
              </span>
              <span class="activity-meta">${t.type?.toUpperCase()||'—'} · ${formatDate(t.createdAt)} ${ref ? '· '+esc(ref) : ''}</span>
            </div>
          </li>`;
        }).join('');
      }

    } catch (err) {
      console.error('Dashboard transactions failed to load:', err);
      grnBody.innerHTML   = emptyRow(5, 'Failed to load: ' + err.message);
      issueBody.innerHTML = emptyRow(5, 'Failed to load: ' + err.message);
      feed.innerHTML       = `<li class="activity-item"><span class="activity-loading">Failed to load: ${esc(err.message)}</span></li>`;
      setKPI('issuedToday', 'Err');
    }
  }

  // ── Out of Stock table ───────────────────────────────────────────────────
  function renderLowStockTable(docs) {
    const tbody = document.getElementById('lowStockBody');

    // docs are raw Firestore QueryDocumentSnapshot objects
    const outItems = docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => (Number(p.qty) || 0) <= 0)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (outItems.length === 0) {
      tbody.innerHTML = emptyRow(3, '✓ All products are in stock.');
      return;
    }

    tbody.innerHTML = outItems.map(p => `
      <tr>
        <td><span class="cat-badge">${esc(p.category || '—')}</span></td>
        <td>${esc(p.name || '—')}</td>
        <td><span class="status-badge badge--danger">Out of Stock</span></td>
      </tr>`).join('');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function setKPI(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatDate(ts) {
    if (!ts) return '—';
    const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function emptyRow(cols, msg) {
    return `<tr><td colspan="${cols}" class="table-empty">${msg}</td></tr>`;
  }
});
