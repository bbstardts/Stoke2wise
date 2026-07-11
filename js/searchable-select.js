/**
 * searchable-select.js
 * ─────────────────────────────────────────────────────────────────────────
 * Turns a plain <select> into a custom-styled combobox: a floating,
 * scrollable dropdown list (not the page-stretching native list), with
 * position that adapts to viewport space (flips above the field, clamps
 * horizontally) so it works on small screens too.
 *
 * The underlying <select> stays in the DOM (hidden) and stays in sync, so
 * all existing code (onchange="handleCategorySelect(id)" etc., disabled
 * state, .value reads, form submit) keeps working with zero changes.
 *
 * Usage:
 *   makeSearchable(document.getElementById('catSel_3'));                // type-to-filter
 *   makeSearchable(document.getElementById('historyActionFilter'), { searchable: false }); // click-only, no typing
 *
 * Call this again any time a select's options are rebuilt (e.g. after
 * category change repopulates the product select) — it will tear down and
 * re-wrap cleanly.
 */

function makeSearchable(selectEl, opts) {
  if (!selectEl) return;
  const searchable = !opts || opts.searchable !== false;

  // Already wrapped? Rebuild the list from the (possibly new) options and bail.
  if (selectEl._searchableWrapper) {
    refreshSearchableOptions(selectEl);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-select' + (searchable ? '' : ' searchable-select--plain');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'searchable-select__input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (!searchable) {
    // Click-only mode: no typing/filtering, just opens the full list — like
    // a normal <select> but custom-styled. readOnly still allows focus,
    // clicks, and keyboard Enter/Escape/Tab; it just blocks text entry.
    input.readOnly = true;
  }

  const list = document.createElement('div');
  list.className = 'searchable-select__list searchable-select__list--floating hidden';

  selectEl.classList.add('searchable-select__native');
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(input);
  wrapper.appendChild(selectEl);
  // Appended to <body> (not the wrapper) so it renders above any ancestor
  // with overflow:hidden/auto — e.g. the scrollable line-items table wrap —
  // instead of being clipped by it.
  document.body.appendChild(list);

  selectEl._searchableWrapper = wrapper;
  selectEl._searchableInput   = input;
  selectEl._searchableList    = list;
  selectEl._searchablePlain   = !searchable;

  function positionList() {
    const r  = input.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: match the input's width, but clamp so the list never
    // runs off the right edge on narrow/mobile viewports.
    const width = Math.min(r.width, vw - 16);
    let left = r.left;
    const maxLeft = vw - width - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    list.style.width = `${width}px`;
    list.style.left  = `${left}px`;

    // Vertical: flip above the field if there isn't enough room below
    // (e.g. field near the bottom of the screen on mobile).
    const listHeight = Math.min(list.scrollHeight, 260);
    const spaceBelow = vh - r.bottom;
    const openAbove  = spaceBelow < listHeight + 8 && r.top > spaceBelow;
    if (openAbove) {
      list.style.top    = 'auto';
      list.style.bottom = `${vh - r.top + 4}px`;
    } else {
      list.style.bottom = 'auto';
      list.style.top    = `${r.bottom + 4}px`;
    }
  }

  function onReposition() {
    if (!list.classList.contains('hidden')) positionList();
  }
  window.addEventListener('scroll', onReposition, true);
  window.addEventListener('resize', onReposition);
  selectEl._searchableOnReposition = onReposition;

  function syncInputFromSelect() {
    const opt = selectEl.selectedOptions[0];
    input.value = (opt && opt.value) ? opt.textContent.trim() : '';
    input.placeholder = (opt && !opt.value) ? opt.textContent.trim() : (searchable ? 'Search…' : '');
  }

  function buildList(filterText) {
    const q = searchable ? (filterText || '').trim().toLowerCase() : '';
    list.innerHTML = '';
    let anyVisible = false;

    Array.from(selectEl.options).forEach(opt => {
      const label = opt.textContent.trim();
      if (q && !label.toLowerCase().includes(q)) return;
      anyVisible = true;

      const row = document.createElement('div');
      row.className = 'searchable-select__option';
      if (opt.value === selectEl.value) row.classList.add('is-selected');
      if (!opt.value) row.classList.add('is-placeholder');
      row.textContent = label;
      row.addEventListener('mousedown', (e) => {
        // mousedown (not click) so it fires before the input's blur hides the list
        e.preventDefault();
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        syncInputFromSelect();
        closeList();
      });
      list.appendChild(row);
    });

    if (!anyVisible) {
      const empty = document.createElement('div');
      empty.className = 'searchable-select__empty';
      empty.textContent = 'No matches';
      list.appendChild(empty);
    }
  }
  selectEl._searchableBuildList = buildList;

  function openList() {
    if (selectEl.disabled) return;
    buildList(searchable && input.value !== getSelectedLabel() ? input.value : '');
    list.classList.remove('hidden');
    positionList();
  }

  function closeList() {
    list.classList.add('hidden');
  }

  function getSelectedLabel() {
    const opt = selectEl.selectedOptions[0];
    return (opt && opt.value) ? opt.textContent.trim() : '';
  }

  input.addEventListener('focus', () => {
    if (searchable) input.select();
    openList();
  });

  input.addEventListener('mousedown', () => {
    // In plain (non-searchable) mode a second click on an already-focused
    // input wouldn't re-fire 'focus', so toggle explicitly on click too.
    if (!searchable && document.activeElement === input) {
      list.classList.contains('hidden') ? openList() : closeList();
    }
  });

  if (searchable) {
    input.addEventListener('input', () => {
      buildList(input.value);
      list.classList.remove('hidden');
      positionList();
    });
  }

  input.addEventListener('blur', () => {
    // slight delay so a pending mousedown on an option still registers
    setTimeout(() => {
      syncInputFromSelect();
      closeList();
    }, 120);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { syncInputFromSelect(); closeList(); input.blur(); }
    if (e.key === 'Enter')  { e.preventDefault(); }
  });

  // Keep a reference so external code can force a refresh (e.g. after
  // disabling/enabling the select, or repopulating its options).
  selectEl._searchableSync = () => {
    input.disabled = selectEl.disabled;
    syncInputFromSelect();
  };

  syncInputFromSelect();
  input.disabled = selectEl.disabled;
}

// Re-reads options/disabled state into an already-wrapped select's UI.
// Call after changing selectEl.innerHTML or selectEl.disabled.
function refreshSearchableOptions(selectEl) {
  if (!selectEl || !selectEl._searchableInput) return;
  selectEl._searchableInput.disabled = selectEl.disabled;
  const opt = selectEl.selectedOptions[0];
  selectEl._searchableInput.value = (opt && opt.value) ? opt.textContent.trim() : '';
  selectEl._searchableInput.placeholder = (opt && !opt.value)
    ? opt.textContent.trim()
    : (selectEl._searchablePlain ? '' : 'Search…');
  // Rebuild the visible dropdown list from the select's current <option>s.
  // Previously this only cleared the list when open and never repopulated
  // it, so newly loaded products (e.g. after picking a category) never
  // appeared in the searchable dropdown even though the underlying
  // <select> had them.
  if (selectEl._searchableBuildList) {
    selectEl._searchableBuildList('');
  }
}

// The dropdown list now lives in document.body (not inside the row), so it
// doesn't get removed automatically when a line-item row is deleted. Call
// this for each searchable select inside a row right before removing that
// row's DOM node, or the floating list div is orphaned in <body>.
function destroySearchableSelect(selectEl) {
  if (!selectEl || !selectEl._searchableList) return;
  if (selectEl._searchableOnReposition) {
    window.removeEventListener('scroll', selectEl._searchableOnReposition, true);
    window.removeEventListener('resize', selectEl._searchableOnReposition);
    selectEl._searchableOnReposition = null;
  }
  selectEl._searchableList.remove();
  selectEl._searchableWrapper = null;
  selectEl._searchableInput = null;
  selectEl._searchableList = null;
}
