(function () {
  const NAV_ITEMS = [
    { icon: '▦',  label: 'Dashboard', href: 'dashboard.html' },
    { icon: '☰',  label: 'Products',  href: 'products.html'  },
    { icon: '฿',  label: 'Pricing',   href: 'pricing.html'   },
    { icon: '▤',  label: 'Suppliers', href: 'suppliers.html' },
    { icon: '↓',  label: 'Receive',   href: 'grn.html'       },
    { icon: '↑',  label: 'Issue',     href: 'issue.html'     },
    { icon: '⏱',  label: 'History',   href: 'history.html'   },
    { icon: '▥',  label: 'Reports',   href: 'reports.html'   },
    { icon: '$',  label: 'Expenses',  href: 'expenses.html'  },
    { icon: '⚙',  label: 'Settings',  href: 'settings.html'  },
  ];

  function buildSidebar(user) {
    const current = window.location.pathname.split('/').pop();

    const navHTML = NAV_ITEMS.map(item => {
      const active = current === item.href ? 'active' : '';
      return `
        <li>
          <a href="${item.href}" class="${active}">
            <span class="nav-icon">${item.icon}</span>
            ${item.label}
          </a>
        </li>`;
    }).join('');

    const userName = user?.displayName || user?.email || 'User';
    const initials = (user?.displayName || user?.email || 'U')
                       .split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    return `
      <div class="sidebar-overlay" id="sidebarOverlay"></div>
      <nav class="sidebar" id="appSidebar">
        <div class="sidebar-brand">
          <span class="brand-icon">⬡</span>
          StockWise
        </div>
        <ul class="sidebar-nav">${navHTML}</ul>
        <div class="sidebar-footer">
          <div class="user-avatar" title="${userName}">${initials}</div>
          <span class="user-name">${userName}</span>
          <button class="theme-toggle-btn" data-theme-toggle title="Toggle theme">◐</button>
          <button class="signout-btn" id="signOutBtn" title="Sign out">↪</button>
        </div>
      </nav>
      <div class="mobile-topbar">
        <button class="hamburger-btn" id="hamburgerBtn" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
        <span class="brand-name">⬡ StockWise</span>
        <button class="theme-toggle-btn" data-theme-toggle title="Toggle theme">◐</button>
      </div>`;
  }

  function injectSidebar(user) {
    const placeholder = document.getElementById('sidebar-placeholder');
    if (!placeholder) return;

    placeholder.outerHTML = buildSidebar(user);

    // Sign out
    document.getElementById('signOutBtn')?.addEventListener('click', async () => {
      try { await window.firebaseAuth.signOut(); } catch (e) { console.error(e); }
      window.location.replace('../index.html');
    });

    // Hamburger open/close
    const sidebar  = document.getElementById('appSidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerBtn');

    function openNav()  { sidebar?.classList.add('open');    overlay?.classList.add('active'); }
    function closeNav() { sidebar?.classList.remove('open'); overlay?.classList.remove('active'); }

    hamburger?.addEventListener('click', openNav);
    overlay?.addEventListener('click', closeNav);

    // Close on nav link tap (mobile)
    sidebar?.querySelectorAll('.sidebar-nav a').forEach(a => {
      a.addEventListener('click', closeNav);
    });
  }

  function init() {
    window.firebaseAuth.onAuthStateChanged((user) => {
      if (!user) return;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => injectSidebar(user));
      } else {
        injectSidebar(user);
      }
    });
  }

  if (window.firebaseAuth) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
