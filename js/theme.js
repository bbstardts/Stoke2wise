/**
 * theme.js
 * ─────────────────────────────────────────────────────────────────────────
 * Dark/light mode. Default follows the browser/OS theme (prefers-color-scheme).
 * If the user clicks a toggle button, that explicit choice is remembered
 * (localStorage) and wins over the system setting from then on, on this
 * device — same pattern as most apps' "auto until you touch it" toggle.
 *
 * IMPORTANT: this file is loaded synchronously as the FIRST thing in
 * <head>, before any stylesheet or body content, so the theme is applied
 * before first paint (no flash of the wrong theme).
 *
 * Any element with the attribute `data-theme-toggle` becomes a working
 * toggle button automatically — including ones injected later, like the
 * sidebar's, since click handling is delegated on `document`.
 */
(function () {
  var STORAGE_KEY = 'stockwise-theme'; // stored value: 'light' | 'dark'

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getStoredTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setStoredTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore (private mode etc.) */ }
  }

  function currentTheme() {
    var stored = getStoredTheme();
    if (stored === 'light' || stored === 'dark') return stored;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function updateToggleButtons(theme) {
    var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    var glyph = theme === 'dark' ? '◑' : '◐';
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-label', label);
      buttons[i].title = label;
      buttons[i].textContent = glyph;
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateToggleButtons(theme);
  }

  // Apply immediately — before the rest of <head> / body even parses.
  applyTheme(currentTheme());

  // If the user hasn't manually overridden, keep following the system
  // theme live (e.g. the OS switches to dark mode at sunset).
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function () {
      if (!getStoredTheme()) applyTheme(currentTheme());
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange); // older Safari
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function toggleTheme(originEvent) {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

    // Browsers without the View Transitions API (or users who asked for
    // reduced motion) just get the plain instant swap — the color/background
    // transition already declared in global.css still gives it a soft fade.
    if (!document.startViewTransition || prefersReducedMotion()) {
      setStoredTheme(next);
      applyTheme(next);
      return;
    }

    // Guarantee the SVG filter defs exist before the animation references
    // them — a filter: url(#missing-id) with no matching element renders
    // the whole layer invisible in most browsers, so this can't be skipped.
    injectWaterFilter();

    var x = originEvent && typeof originEvent.clientX === 'number' ? originEvent.clientX : window.innerWidth / 2;
    var y = originEvent && typeof originEvent.clientY === 'number' ? originEvent.clientY : window.innerHeight / 2;
    var endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    var transition = document.startViewTransition(function () {
      setStoredTheme(next);
      applyTheme(next);
    });

    transition.ready.then(function () {
      // New theme: revealed through an expanding circle, like a spreading
      // pool of liquid rather than a mechanical wipe. The edge of the
      // circle is run through an animated turbulence/displacement filter
      // (sw-theme-water) so it's an uneven, rolling front instead of a
      // perfect geometric ring, and it settles back to a plain, undistorted
      // filter by the end so the final screen isn't left warped.
      document.documentElement.animate(
        {
          clipPath: [
            'circle(0px at ' + x + 'px ' + y + 'px)',
            'circle(' + endRadius + 'px at ' + x + 'px ' + y + 'px)'
          ],
          filter: [
            'blur(4px) saturate(140%) url(#' + THEME_WATER_FILTER_ID + ')',
            'blur(4px) saturate(140%) url(#' + THEME_WATER_FILTER_ID + ')',
            'blur(0px) saturate(100%)'
          ],
          offset: [0, 0.25, 1]
        },
        {
          duration: 1100,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );

      // Old theme: a light fade underneath, no blur — animating filter on
      // both layers at once doubled the cost for little visible benefit.
      document.documentElement.animate(
        { opacity: [1, 0.7] },
        {
          duration: 1100,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-old(root)'
        }
      );
    });
  }

  // Delegated so it works for buttons that don't exist yet at load time
  // (the sidebar is injected by sidebar.js after auth resolves).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;

    toggleTheme(e);

    // A quick liquid squish-and-settle on the button itself — the glass
    // pane compresses on tap and wobbles back to its round shape.
    if (btn.animate && !prefersReducedMotion()) {
      btn.animate(
        [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(0.80, 1.14)' },
          { transform: 'scale(1.10, 0.92)' },
          { transform: 'scale(0.97, 1.03)' },
          { transform: 'scale(1, 1)' }
        ],
        { duration: 480, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
    }
  });

  // Re-affirm icon/label once the DOM (and any injected buttons) exist.
  document.addEventListener('DOMContentLoaded', function () {
    updateToggleButtons(currentTheme());
  });

  window.toggleTheme = toggleTheme;

  // ── Liquid glass hover highlight ──
  // Tracks the pointer over any button (native <button>/<input>, or any
  // element with "btn" in its class name — see css/global.css) and sets
  // --glass-x / --glass-y to the pointer's position within that button,
  // so the CSS radial-gradient specular highlight follows the cursor
  // like light moving across curved glass. Delegated + rAF-throttled so
  // it's cheap even with lots of buttons on a page.
  var glassTarget = null;
  var glassRafPending = false;
  var glassPointerX = 0;
  var glassPointerY = 0;

  var GLASS_SELECTOR = 'button, input[type="button"], input[type="submit"], [class*="btn"]:not(.action-btns), .sidebar-nav a';

  function isGlassButton(el) {
    if (!el || !el.matches) return false;
    return el.matches(GLASS_SELECTOR);
  }

  function applyGlassPosition() {
    glassRafPending = false;
    if (!glassTarget) return;
    var rect = glassTarget.getBoundingClientRect();
    var x = ((glassPointerX - rect.left) / rect.width) * 100;
    var y = ((glassPointerY - rect.top) / rect.height) * 100;
    glassTarget.style.setProperty('--glass-x', x + '%');
    glassTarget.style.setProperty('--glass-y', y + '%');
  }

  document.addEventListener('pointermove', function (e) {
    var btn = e.target.closest && e.target.closest(GLASS_SELECTOR);
    glassTarget = isGlassButton(btn) ? btn : null;
    if (!glassTarget) return;
    glassPointerX = e.clientX;
    glassPointerY = e.clientY;
    if (!glassRafPending) {
      glassRafPending = true;
      requestAnimationFrame(applyGlassPosition);
    }
  });

  // ── Water-ripple text reveal (light mode only) ──
  // Wraps each button/link's own text in a <span class="glass-text"> so
  // CSS can filter just the text through an animated SVG turbulence
  // filter on hover — like the label is surfacing through a ripple of
  // water. Icons/badges inside the button (separate child elements) are
  // left alone; only raw text nodes get wrapped. Dark mode keeps the
  // plain glass shine instead — no ripple there.
  var WATER_FILTER_ID = 'sw-water-ripple';
  var GLASS_SHIMMER_FILTER_ID = 'sw-glass-shimmer';
  var THEME_WATER_FILTER_ID = 'sw-theme-water';

  function injectWaterFilter() {
    if (document.getElementById(WATER_FILTER_ID)) return;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    svg.innerHTML =
      '<filter id="' + WATER_FILTER_ID + '" x="-20%" y="-100%" width="140%" height="300%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" numOctaves="2" seed="7" result="sw-noise">' +
      '<animate attributeName="baseFrequency" dur="1.8s" repeatCount="indefinite" ' +
      'values="0.01 0.09;0.03 0.14;0.01 0.09" />' +
      '</feTurbulence>' +
      '<feDisplacementMap in="SourceGraphic" in2="sw-noise" scale="3" xChannelSelector="R" yChannelSelector="G" />' +
      '</filter>' +
      // Smaller, gentler distortion for the button glint highlight (the
      // ::before radial gradient in css/global.css). A bigger displacement
      // scale here would tear the small specular core apart instead of
      // just making its edge waver, so this stays much subtler than the
      // text-ripple filter above.
      '<filter id="' + GLASS_SHIMMER_FILTER_ID + '" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" numOctaves="2" seed="3" result="sw-glass-noise">' +
      '<animate attributeName="baseFrequency" dur="2.2s" repeatCount="indefinite" ' +
      'values="0.02 0.05;0.06 0.11;0.02 0.05" />' +
      '</feTurbulence>' +
      '<feDisplacementMap in="SourceGraphic" in2="sw-glass-noise" scale="12" xChannelSelector="R" yChannelSelector="G" />' +
      '</filter>' +
      // Used on the expanding circle-reveal wipe when the theme toggles
      // (see toggleTheme below). Lower baseFrequency than the two filters
      // above means bigger, slower-rolling blobs of noise instead of fine
      // grain — right for warping the *edge* of a large shape rather than
      // a small highlight — and a much bigger displacement scale so that
      // edge actually reads as an uneven, spreading liquid front instead
      // of a perfect circle.
      '<filter id="' + THEME_WATER_FILTER_ID + '" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" numOctaves="3" seed="11" result="sw-theme-noise">' +
      '<animate attributeName="baseFrequency" dur="1.1s" repeatCount="indefinite" ' +
      'values="0.008 0.012;0.014 0.02;0.008 0.012" />' +
      '</feTurbulence>' +
      '<feDisplacementMap in="SourceGraphic" in2="sw-theme-noise" scale="45" xChannelSelector="R" yChannelSelector="G" />' +
      '</filter>';
    (document.body || document.documentElement).appendChild(svg);
  }

  function wrapButtonText(el) {
    if (!el || el.dataset.glassWrapped === '1') return;
    var child = el.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (child.nodeType === 3 && child.textContent.trim().length > 0) {
        var span = document.createElement('span');
        span.className = 'glass-text';
        span.textContent = child.textContent;
        el.replaceChild(span, child);
      }
      child = next;
    }
    el.dataset.glassWrapped = '1';
  }

  function wrapAllGlassText(root) {
    injectWaterFilter();
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(GLASS_SELECTOR).forEach(wrapButtonText);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wrapAllGlassText(document); });
  } else {
    wrapAllGlassText(document);
  }

  // Most rows (products, suppliers, pricing, history...) render their
  // Edit/Delete buttons after an async Firestore load, well after
  // DOMContentLoaded — this catches those instead of missing them.
  var glassObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(GLASS_SELECTOR)) wrapButtonText(node);
        if (node.querySelectorAll) wrapAllGlassText(node);
      }
    }
  });
  glassObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
