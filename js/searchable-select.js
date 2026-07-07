/**
 * searchable-select.js
 * ─────────────────────────────────────────────────────────────────────────
 * Turns a plain <select> into a searchable combobox: a text input the user
 * can type into to filter the options, with a scrollable, contained
 * dropdown list underneath (not the page-stretching native list).
 *
 * The underlying <select> stays in the DOM (hidden) and stays in sync, so
 * all existing code (onchange="handleCategorySelect(id)" etc., disabled
 * state, .value reads, form submit) keeps working with zero changes.
 *
 * Usage:
 *   makeSearchable(document.getElementById('catSel_3'));
 *
 * Call this again any time a select's options are rebuilt (e.g. after
 * category change repopulates the product select) — it will tear down and
 * re-wrap cleanly.
 */

function makeSearchable(selectEl) {
  if (!selectEl) return;

  // Already wrapped? Rebuild the list from the (possibly new) options and bail.
  if (selectEl._searchableWrapper) {
    refreshSearchableOptions(selectEl);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-select';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'searchable-select__input';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const list = document.createElement('div');
  list.className = 'searchable-select__list hidden';

  selectEl.classList.add('searchable-select__native');
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(input);
  wrapper.appendChild(list);
  wrapper.appendChild(selectEl);

  selectEl._searchableWrapper = wrapper;
  selectEl._searchableInput   = input;
  selectEl._searchableList    = list;

  function syncInputFromSelect() {
    const opt = selectEl.selectedOptions[0];
    input.value = (opt && opt.value) ? opt.textContent.trim() : '';
    input.placeholder = (opt && !opt.value) ? opt.textContent.trim() : 'Search…';
  }

  function buildList(filterText) {
    const q = (filterText || '').trim().toLowerCase();
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
    buildList(input.value === getSelectedLabel() ? '' : input.value);
    list.classList.remove('hidden');
  }

  function closeList() {
    list.classList.add('hidden');
  }

  function getSelectedLabel() {
    const opt = selectEl.selectedOptions[0];
    return (opt && opt.value) ? opt.textContent.trim() : '';
  }

  input.addEventListener('focus', () => {
    input.select();
    openList();
  });

  input.addEventListener('input', () => {
    buildList(input.value);
    list.classList.remove('hidden');
  });

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
  selectEl._searchableInput.placeholder = (opt && !opt.value) ? opt.textContent.trim() : 'Search…';
  // Rebuild the visible dropdown list from the select's current <option>s.
  // Previously this only cleared the list when open and never repopulated
  // it, so newly loaded products (e.g. after picking a category) never
  // appeared in the searchable dropdown even though the underlying
  // <select> had them.
  if (selectEl._searchableBuildList) {
    selectEl._searchableBuildList('');
  }
}
