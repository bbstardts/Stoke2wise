/**
 * dashboard.js — No composite indexes required.
 * Fetches all transactions and filters/sorts in JavaScript.
 *
 * Includes: KPI cards, recent GRN/Issue tables, activity feed,
 * Low Stock Alerts panel (sorted by deficit severity), monthly
 * GRN/Issue counts, most issued product this week, and a
 * lightweight vanilla-JS stock movement bar chart (received vs issued).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const db = window.firebaseDb;

  let latestAtRiskItems = []; // populated by renderLowStockTable, used by the Purchase Request modal

  document.getElementById('currentDate').textContent =
    new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  document.getElementById('refreshBtn').addEventListener('click', () => loadAll());
  loadAll();

  // ── Purchase Request modal wiring ──────────────────────────────────────
  const prModal        = document.getElementById('purchaseRequestModal');
  const prBody          = document.getElementById('purchaseRequestBody');
  const generatePrBtn  = document.getElementById('generatePurchaseRequestBtn');
  const closePrBtn      = document.getElementById('closePurchaseRequestModal');
  const cancelPrBtn     = document.getElementById('cancelPurchaseRequest');
  const confirmPrBtn    = document.getElementById('confirmPurchaseRequestBtn');

  generatePrBtn?.addEventListener('click', openPurchaseRequestModal);
  closePrBtn?.addEventListener('click', closePurchaseRequestModal);
  cancelPrBtn?.addEventListener('click', closePurchaseRequestModal);
  confirmPrBtn?.addEventListener('click', exportPurchaseRequest);

  /**
   * Suggested reorder formula: bring the item back up to its minimum level,
   * plus a 20% buffer above that minimum (rounded up), so the next order
   * doesn't immediately dip below minimum again. Never less than 1.
   *   reorderQty = ceil((minLevel - qty) + (minLevel * 0.2))
   */
  function suggestedReorderQty(qty, minLevel) {
    const deficit = Math.max(0, minLevel - qty);
    const buffer  = minLevel * 0.2;
    return Math.max(1, Math.ceil(deficit + buffer));
  }

  function openPurchaseRequestModal() {
    if (latestAtRiskItems.length === 0) return;

    prBody.innerHTML = latestAtRiskItems.map((p, i) => `
      <tr>
        <td><span class="cat-badge">${esc(p.category || '—')}</span></td>
        <td>${esc(p.name || '—')}</td>
        <td class="cell-muted">${p.qty}</td>
        <td class="cell-muted">${p.min}</td>
        <td>
          <input type="number" class="pr-reorder-input" id="prQty_${i}"
                 min="1" step="1" value="${suggestedReorderQty(p.qty, p.min)}" />
        </td>
      </tr>`).join('');

    prModal.classList.remove('hidden');
  }

  function closePurchaseRequestModal() {
    prModal.classList.add('hidden');
  }

  function exportPurchaseRequest() {
    if (!window.printPurchaseRequest) return;

    const items = latestAtRiskItems.map((p, i) => {
      const input = document.getElementById(`prQty_${i}`);
      const reorderQty = Math.max(1, Number(input?.value) || suggestedReorderQty(p.qty, p.min));
      return {
        category: p.category || '—',
        productName: p.name || '—',
        qty: p.qty,
        minLevel: p.min,
        reorderQty,
      };
    });

    window.printPurchaseRequest({
      items,
      requestNo: 'PR-' + Date.now(),
      requestedBy: window.currentUser?.email || window.currentUser?.uid || '—',
    });

    closePurchaseRequestModal();
  }

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
    document.getElementById('lowStockBody').innerHTML    = skeletonRows(5, 3);
    document.getElementById('activityFeed').innerHTML    = Array(4).fill(0).map(() =>
      `<li class="activity-item">
        <span class="activity-dot" style="background:#e5e7eb"></span>
        <div class="activity-body">
          <span class="skeleton" style="display:block;height:12px;border-radius:4px;width:70%;margin-bottom:6px"></span>
          <span class="skeleton" style="display:block;height:10px;border-radius:4px;width:40%"></span>
        </div>
      </li>`).join('');
    document.getElementById('movementChart').innerHTML =
      `<div class="table-loading">Loading…</div>`;

    // Load sequentially so skeletons don't get re-applied after data loads
    await loadProductKPIs();
    await loadTransactions();
  }

  // ── Products: KPIs + Low Stock Alerts table ──────────────────────────────
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
        emptyRow(5, 'Failed to load: ' + err.message);
      latestAtRiskItems = [];
      if (generatePrBtn) generatePrBtn.disabled = true;
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

      // ── GRNs / Issues this month, most issued product this week, chart ──
      renderMonthlyAndWeeklyKPIs(grns, issues);
      renderMovementChart(docs);

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
      setKPI('grnsThisMonth', 'Err');
      setKPI('issuesThisMonth', 'Err');
      setKPI('topProductThisWeek', 'Err');
      document.getElementById('movementChart').innerHTML =
        `<div class="chart-empty">Failed to load: ${esc(err.message)}</div>`;
    }
  }

  // ── GRNs this month, Issues this month, most issued product this week ──
  function renderMonthlyAndWeeklyKPIs(grns, issues) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const grnsThisMonth = grns.filter(d => new Date(d.createdAt || 0) >= monthStart).length;
    const issuesThisMonth = issues.filter(d => new Date(d.createdAt || 0) >= monthStart).length;
    setKPI('grnsThisMonth', grnsThisMonth);
    setKPI('issuesThisMonth', issuesThisMonth);

    // Most issued product this week (last 7 days, by total qty issued).
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0,0,0,0);
    const qtyByProduct = {};
    issues.forEach(d => {
      const dt = new Date(d.createdAt || 0);
      if (dt < weekStart) return;
      (d.items || []).forEach(i => {
        const name = i.productName || 'Unknown';
        qtyByProduct[name] = (qtyByProduct[name] || 0) + (Number(i.qty) || 0);
      });
    });

    const topEntry = Object.entries(qtyByProduct).sort((a, b) => b[1] - a[1])[0];
    const topEl = document.getElementById('topProductThisWeek');
    if (topEl) {
      // textContent, not innerHTML — no escaping needed here.
      topEl.textContent = topEntry ? `${topEntry[0]} (${topEntry[1]})` : 'No issues this week';
    }
  }

  // ── Stock Movement Chart: received vs issued, last 7 days, vanilla bars ──
  function renderMovementChart(docs) {
    const container = document.getElementById('movementChart');
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }

    const receivedByDay = days.map(() => 0);
    const issuedByDay   = days.map(() => 0);

    docs.forEach(t => {
      const dt = new Date(t.createdAt || 0);
      const dayIndex = days.findIndex(d => {
        const next = new Date(d); next.setDate(next.getDate() + 1);
        return dt >= d && dt < next;
      });
      if (dayIndex === -1) return;
      const qty = (t.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
      if (t.type === 'grn') receivedByDay[dayIndex] += qty;
      else if (t.type === 'issue') issuedByDay[dayIndex] += qty;
    });

    const maxVal = Math.max(1, ...receivedByDay, ...issuedByDay);
    const hasData = receivedByDay.some(v => v > 0) || issuedByDay.some(v => v > 0);

    if (!hasData) {
      container.innerHTML = `<div class="chart-empty">No stock movement in the last 7 days.</div>`;
      return;
    }

    const bars = days.map((d, i) => {
      const inH  = Math.round((receivedByDay[i] / maxVal) * 100);
      const outH = Math.round((issuedByDay[i] / maxVal) * 100);
      return `<div class="chart-bar-group">
        <div class="chart-bar chart-bar--in" style="height:${inH}%" title="Received: ${receivedByDay[i]}"></div>
        <div class="chart-bar chart-bar--out" style="height:${outH}%" title="Issued: ${issuedByDay[i]}"></div>
      </div>`;
    }).join('');

    const labels = days.map(d =>
      `<span class="chart-x-label">${d.toLocaleDateString(undefined, { weekday: 'short' })}</span>`
    ).join('');

    container.innerHTML = `
      <div class="chart-bars">${bars}</div>
      <div class="chart-x-axis">${labels}</div>
    `;
  }

  // ── Low Stock Alerts table ───────────────────────────────────────────────
  // A product is "at risk" if qty <= minLevel (minLevel > 0 required, since a
  // 0 minLevel means no threshold has been set for that product).
  // Sorted most-critical-first: out-of-stock items first, then by how far
  // below minimum the current qty is (largest deficit / lowest qty-to-min
  // ratio at the top).
  function renderLowStockTable(docs) {
    const tbody = document.getElementById('lowStockBody');

    const atRiskItems = docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => {
        const qty = Number(p.qty) || 0;
        const min = Number(p.minLevel) || 0;
        return min > 0 && qty <= min;
      })
      .map(p => {
        const qty = Number(p.qty) || 0;
        const min = Number(p.minLevel) || 0;
        const deficit = min - qty;
        const ratio = min > 0 ? qty / min : 0;
        return { ...p, qty, min, deficit, ratio };
      })
      .sort((a, b) => {
        // Out of stock items always float to the top.
        if (a.qty <= 0 && b.qty > 0) return -1;
        if (b.qty <= 0 && a.qty > 0) return 1;
        // Then by largest absolute deficit.
        if (b.deficit !== a.deficit) return b.deficit - a.deficit;
        // Tie-break by lowest qty-to-min ratio (more critical first).
        return a.ratio - b.ratio;
      });

    if (atRiskItems.length === 0) {
      tbody.innerHTML = emptyRow(5, 'All products are above their minimum stock level.');
      latestAtRiskItems = [];
      if (generatePrBtn) generatePrBtn.disabled = true;
      return;
    }

    latestAtRiskItems = atRiskItems;
    if (generatePrBtn) generatePrBtn.disabled = false;

    tbody.innerHTML = atRiskItems.map(p => {
      const isOut = p.qty <= 0;
      const statusClass = isOut ? 'badge--danger' : 'badge--warning';
      const statusLabel  = isOut ? 'Out of Stock' : 'Low Stock';
      return `
      <tr>
        <td><span class="cat-badge">${esc(p.category || '—')}</span></td>
        <td>${esc(p.name || '—')}</td>
        <td><span class="qty-badge qty-badge--out">${p.qty}</span></td>
        <td class="cell-muted">${p.min}</td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      </tr>`;
    }).join('');
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
