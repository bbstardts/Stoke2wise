/**
 * ui-dialog.js
 * ─────────────────────────────────────────────────────────────────────────
 * Drop-in replacements for the browser's native alert()/confirm() popups,
 * styled to match the rest of StockWise (same tokens as .modal/.modal-box
 * in global.css). Nothing here touches page logic — call sites just swap
 * `alert(msg)` → `customAlert(msg, type)` and
 * `confirm(msg)` → `await customConfirm(msg, opts)`.
 *
 * customAlert(message, type)
 *   type: 'success' | 'error' | 'warning' | 'info'  (default 'info')
 *   Shows a dismissible toast, top-right (bottom on mobile). Fire-and-forget.
 *
 * customConfirm(message, opts)
 *   opts: { title, confirmText, cancelText, danger }
 *   Returns a Promise<boolean> — true if the user confirmed.
 *   Usage: if (!(await customConfirm('Delete this item?', { danger: true }))) return;
 */

const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: '▦' };
const TOAST_DURATION_MS = 4200;

function getToastStack() {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function customAlert(message, type) {
  type = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
  const stack = getToastStack();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');

  const icon = document.createElement('div');
  icon.className = 'toast-icon';
  icon.textContent = TOAST_ICONS[type];

  const msg = document.createElement('div');
  msg.className = 'toast-msg';
  msg.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.textContent = '✕';

  const bar = document.createElement('div');
  bar.className = 'toast-bar';
  bar.style.animationDuration = `${TOAST_DURATION_MS}ms`;

  toast.appendChild(icon);
  toast.appendChild(msg);
  toast.appendChild(closeBtn);
  toast.appendChild(bar);
  stack.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('is-visible'));

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 200);
  }

  const timer = setTimeout(dismiss, TOAST_DURATION_MS);
  closeBtn.addEventListener('click', dismiss);
  toast.addEventListener('mouseenter', () => { bar.style.animationPlayState = 'paused'; clearTimeout(timer); });
  toast.addEventListener('mouseleave', () => { bar.style.animationPlayState = 'running'; setTimeout(dismiss, 1200); });

  return toast;
}

function customConfirm(message, opts) {
  opts = opts || {};
  const danger = !!opts.danger;
  const title = opts.title || (danger ? 'Confirm removal' : 'Please confirm');
  const confirmText = opts.confirmText || (danger ? 'Delete' : 'Confirm');
  const cancelText = opts.cancelText || 'Cancel';

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = `modal confirm-modal ${danger ? 'confirm-modal--danger' : 'confirm-modal--default'}`;

    const box = document.createElement('div');
    box.className = 'modal-box';

    const icon = document.createElement('div');
    icon.className = 'confirm-icon';
    icon.textContent = danger ? '⚠' : '✓';

    const heading = document.createElement('h3');
    heading.style.marginBottom = '4px';
    heading.style.fontSize = '16px';
    heading.style.fontWeight = '700';
    heading.textContent = title;

    const msg = document.createElement('p');
    msg.className = 'confirm-message';
    msg.style.marginTop = '10px';
    msg.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-ghost';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = danger ? 'btn-danger' : 'btn-primary';
    confirmBtn.textContent = confirmText;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(icon);
    box.appendChild(heading);
    box.appendChild(msg);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(result);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter')  close(true);
    }

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKeydown);

    confirmBtn.focus();
  });
}
