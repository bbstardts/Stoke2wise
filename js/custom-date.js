/**
 * custom-date.js
 * ─────────────────────────────────────────────────────────────────────────
 * Turns a plain <input type="date"> into a custom-styled calendar picker,
 * same technique as searchable-select.js: the real <input type="date">
 * stays in the DOM (hidden) and stays in sync, so all existing code
 * (.value reads, 'change' listeners, required/disabled, form submit)
 * keeps working with zero changes — including code that sets
 * `input.value = '2026-07-16'` directly (e.g. resetting a form), which is
 * intercepted via a property override and reflected into the display.
 *
 * Usage:
 *   makeDatePicker(document.getElementById('expenseDate'));
 *   makeDatePicker(document.getElementById('dateFrom'), { clearable: true });
 */

function makeDatePicker(inputEl, opts) {
  if (!inputEl || inputEl._customDateWrapper) return;
  opts = opts || {};
  const clearable = opts.clearable !== false; // default: show a Clear action

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-date';

  const display = document.createElement('input');
  display.type = 'text';
  display.className = 'custom-date__display';
  display.readOnly = true;
  display.autocomplete = 'off';
  display.placeholder = inputEl.title || 'Select date';

  const icon = document.createElement('span');
  icon.className = 'custom-date__icon';
  icon.textContent = '▦';

  const panel = document.createElement('div');
  panel.className = 'custom-date__panel hidden';

  inputEl.classList.add('custom-date__native');
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(display);
  wrapper.appendChild(icon);
  wrapper.appendChild(inputEl);
  // Panel floats from <body> so it isn't clipped by scrollable/overflow
  // ancestors, same reasoning as searchable-select's list.
  document.body.appendChild(panel);

  inputEl._customDateWrapper = wrapper;
  inputEl._customDateDisplay = display;
  inputEl._customDatePanel = panel;

  // ── Intercept the .value property so programmatic sets (not just user
  // clicks) keep the display text in sync, e.g. `input.value = today` ──
  const nativeDesc =
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(inputEl, 'value', {
    configurable: true,
    get() { return nativeDesc.get.call(inputEl); },
    set(v) {
      nativeDesc.set.call(inputEl, v);
      syncDisplay();
    }
  });

  let viewYear, viewMonth; // 0-indexed month, the month currently shown

  function formatDisplay(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function syncDisplay() {
    display.value = formatDisplay(nativeDesc.get.call(inputEl));
  }

  function positionPanel() {
    const r = display.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = panel.offsetWidth || 264;
    let left = r.left;
    const maxLeft = vw - panelW - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);

    const panelH = panel.offsetHeight || 300;
    const spaceBelow = vh - r.bottom;
    const openAbove = spaceBelow < panelH + 8 && r.top > spaceBelow;
    panel.style.left = `${left}px`;
    if (openAbove) {
      panel.style.top = 'auto';
      panel.style.bottom = `${vh - r.top + 4}px`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${r.bottom + 4}px`;
    }
  }

  function onReposition() {
    if (!panel.classList.contains('hidden')) positionPanel();
  }
  window.addEventListener('scroll', onReposition, true);
  window.addEventListener('resize', onReposition);
  inputEl._customDateOnReposition = onReposition;

  function renderCalendar() {
    const todayIso = new Date();
    todayIso.setHours(0, 0, 0, 0);
    const selectedIso = nativeDesc.get.call(inputEl);

    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay(); // 0 = Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    panel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'custom-date__head';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'custom-date__nav';
    prevBtn.textContent = '‹';
    const label = document.createElement('div');
    label.className = 'custom-date__label';
    label.textContent = monthLabel;
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'custom-date__nav';
    nextBtn.textContent = '›';
    head.appendChild(prevBtn);
    head.appendChild(label);
    head.appendChild(nextBtn);
    panel.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'custom-date__grid';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
      const el = document.createElement('div');
      el.className = 'custom-date__dow';
      el.textContent = d;
      grid.appendChild(el);
    });

    function isoFor(y, m, d) {
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    function dayBtn(y, m, d, muted) {
      const iso = isoFor(y, m, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-date__day';
      if (muted) btn.classList.add('is-muted');
      const cellDate = new Date(y, m, d);
      cellDate.setHours(0, 0, 0, 0);
      if (cellDate.getTime() === todayIso.getTime()) btn.classList.add('is-today');
      if (iso === selectedIso) btn.classList.add('is-selected');
      btn.textContent = String(d);
      btn.addEventListener('click', () => selectDate(iso));
      return btn;
    }

    for (let i = startDow - 1; i >= 0; i--) {
      grid.appendChild(dayBtn(
        viewMonth === 0 ? viewYear - 1 : viewYear,
        viewMonth === 0 ? 11 : viewMonth - 1,
        daysInPrevMonth - i, true
      ));
    }
    for (let d = 1; d <= daysInMonth; d++) grid.appendChild(dayBtn(viewYear, viewMonth, d, false));
    const trailing = (7 - (grid.children.length - 7) % 7) % 7;
    for (let d = 1; d <= trailing; d++) {
      grid.appendChild(dayBtn(
        viewMonth === 11 ? viewYear + 1 : viewYear,
        viewMonth === 11 ? 0 : viewMonth + 1,
        d, true
      ));
    }
    panel.appendChild(grid);

    const foot = document.createElement('div');
    foot.className = 'custom-date__foot';
    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.textContent = 'Today';
    todayBtn.addEventListener('click', () => {
      const now = new Date();
      selectDate(isoFor(now.getFullYear(), now.getMonth(), now.getDate()));
    });
    foot.appendChild(todayBtn);
    if (clearable) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'custom-date__clear';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', () => selectDate(''));
      foot.appendChild(clearBtn);
    }
    panel.appendChild(foot);

    prevBtn.addEventListener('click', () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });
    nextBtn.addEventListener('click', () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });
  }

  function selectDate(iso) {
    nativeDesc.set.call(inputEl, iso);
    syncDisplay();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    closePanel();
  }

  function openPanel() {
    if (inputEl.disabled) return;
    const current = nativeDesc.get.call(inputEl);
    const base = current ? new Date(current + 'T00:00:00') : new Date();
    viewYear = base.getFullYear();
    viewMonth = base.getMonth();
    renderCalendar();
    panel.classList.remove('hidden');
    positionPanel();
    document.addEventListener('mousedown', onOutsideClick);
  }

  function closePanel() {
    panel.classList.add('hidden');
    document.removeEventListener('mousedown', onOutsideClick);
  }

  function onOutsideClick(e) {
    if (!panel.contains(e.target) && e.target !== display && e.target !== icon) closePanel();
  }

  display.addEventListener('click', () => {
    panel.classList.contains('hidden') ? openPanel() : closePanel();
  });
  icon.addEventListener('click', () => display.click());
  display.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); display.click(); }
  });

  inputEl._customDateSync = () => {
    display.disabled = inputEl.disabled;
    syncDisplay();
  };

  syncDisplay();
  display.disabled = inputEl.disabled;
}

// Re-syncs an already-wrapped date input's display text and disabled state.
// Call after directly toggling inputEl.disabled.
function refreshCustomDate(inputEl) {
  if (inputEl && inputEl._customDateSync) inputEl._customDateSync();
}
