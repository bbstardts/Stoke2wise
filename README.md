# StockWise — Warehouse Management System

A lightweight, Firebase-backed warehouse management web app.
Built with plain HTML, CSS, and JavaScript — no bundler required.

---

## Project Structure

```
warehouse-app/
│
├── index.html                  # Login page (entry point)
│
├── pages/
│   ├── dashboard.html          # KPIs, low-stock alerts, activity feed
│   ├── products.html           # Product catalogue — full CRUD
│   ├── grn.html                # Goods Received Note (stock IN)
│   ├── issue.html              # Stock Issue (stock OUT)
│   ├── history.html            # All transactions — filter, search, export CSV
│   └── settings.html           # Profile, warehouse config, user management
│
├── css/
│   ├── global.css              # Design tokens, reset, shared components
│   │                             (buttons, tables, modals, form fields)
│   ├── layout.css              # Sidebar + main-content shell for all pages
│   ├── login.css               # Login page card + brand styles
│   ├── dashboard.css           # KPI grid, activity feed
│   ├── products.css            # Stock badges, row action buttons
│   ├── forms.css               # Shared GRN + Issue form card + line-items
│   ├── history.css             # Transaction type badges, date filters, pagination
│   └── settings.css            # Settings section cards, inline invite form
│
└── js/
    ├── firebase-config.js      # Firebase app init + service exports (auth, db)
    ├── auth.js                 # Login form handler (index.html only)
    ├── auth-guard.js           # Route protection — redirects if not logged in
    ├── sidebar.js              # Injects sidebar HTML + active link + sign-out
    ├── dashboard.js            # KPI queries, low-stock table, activity feed
    ├── products.js             # Product CRUD, real-time table, modal, filtering
    ├── grn.js                  # GRN form, dynamic line items, batch stock update
    ├── issue.js                # Issue form, stock validation, batch stock decrement
    ├── history.js              # Transaction list, filters, pagination, CSV export
    └── settings.js             # Profile, password, warehouse config, users
```

---

## Firestore Collections

| Collection     | Purpose                                              |
|----------------|------------------------------------------------------|
| `/products`    | Product catalogue. Each doc holds qty, minLevel, etc.|
| `/transactions`| Every GRN and Issue record with line-item arrays.    |
| `/users`       | App-level user profiles and role assignments.        |
| `/settings`    | Single `config` doc: warehouse name, currency, etc.  |

---

## Getting Started

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Email/Password** authentication.
3. Create a **Firestore** database (start in test mode).
4. Register a Web app and copy the `firebaseConfig` object.
5. Paste it into `js/firebase-config.js` and uncomment the init lines.
6. Add the Firebase CDN `<script>` tags to each HTML file above the local scripts.
7. Open `index.html` in a browser (or serve with `npx serve .`).

---

## Design System

All colors, spacing, and typography are defined as CSS custom properties in
`css/global.css` under `:root`. Update tokens there to retheme the entire app.

| Token                  | Value     | Usage                      |
|------------------------|-----------|----------------------------|
| `--color-primary`      | `#4f8ef7` | Buttons, active nav, focus |
| `--color-success`      | `#34c97a` | Stock-in badges, ok stock  |
| `--color-warning`      | `#f5a623` | Low stock, warnings        |
| `--color-danger`       | `#e85454` | Stock-out, empty, errors   |
| `--color-bg`           | `#0f1117` | Page background            |
| `--color-surface`      | `#1a1d27` | Cards, sidebar             |
