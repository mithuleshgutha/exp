# OpTrack — Documentation

Industrial Operations Tracker. Node.js/Express backend, PostgreSQL (Supabase), Bootstrap 5 frontend.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + Express |
| Database | PostgreSQL via Supabase (pooler port 6543) |
| Auth | JWT (Bearer token in localStorage) |
| Frontend | Bootstrap 5, vanilla JS, mobile-first |

---

## Pages

| Page | URL | Role |
|------|-----|------|
| Login | `/login.html` | All |
| Dashboard | `/dashboard.html` | All |
| Transactions | `/transactions.html` | All |
| Expenses | `/expenses.html` | All |
| Customers | `/customers.html` | All |
| Customer Ledger | `/ledger.html?id=X` | All |
| Accounts | `/accounts.html` | All |
| Account Ledger | `/account-ledger.html?id=X` | All |
| Stock | `/stock.html` | All |
| Users | `/users.html` | Admin only |

---

## Auth

- Login with `username` + `password`
- JWT stored in `localStorage` (`token`, `userName`, `userUsername`, `userRole`)
- Role: `admin` or `user`
- Admin extras: reset stock button, Users page, delete transactions

Default admin: `username: admin`, `password: admin123`

---

## Dashboard

Shows summary for selected month (dropdown populated from actual transaction months in DB).

**Cards:**
- **Net Profit** = Sales − Purchases − Expenses
- **Total Sales** → clicks to Transactions filtered by SALE
- **Total Purchases** → clicks to Transactions filtered by PURCHASE
- **Total Expenses** → clicks to Expenses page
- **Payment In / Payment Out**
- **Total Receivable** — sum of positive customer balances (customers owe you)
- **Total Payable** — sum of negative customer balances (you owe customers)

Receivable/Payable cards open drill-down modal listing each customer with balance.

---

## Transactions

All financial entries except standalone expenses.

### Categories

| Category | Description | Stock effect |
|----------|-------------|-------------|
| Drip | Drip pipe sale/purchase | Yes — qty, meters, weight |
| Dhana | Dhana bags sale/purchase | Yes — bags |
| Dipper | Dipper sale/purchase | Yes — qty |
| Scrap | Scrap sale/purchase | No |
| Payment | Payment in/out with customer | No |
| Expense | Business expense | No |

### Transaction Types

| Type | Meaning |
|------|---------|
| SALE | You sold to customer |
| PURCHASE | You bought from supplier |
| PAYMENT_IN | Customer paid you |
| PAYMENT_OUT | You paid customer |
| EXPENSE | Business expense outflow |

### Drip Sale Flow
When category = Drip, a dropdown shows available drip types from stock (e.g. "Inline · 400m · 14kg (stock: 30)"). User picks type → meters/weight auto-filled. User enters quantity manually.

### Account Tracking
Drip, Dhana, Dipper, Scrap transactions show an Account dropdown — records which account (Cash, Company, etc.) the payment went into or came from.

### Calc Method (Drip only)
- `Quantity × Weight × Rate` — charges by weight
- `Quantity × Meters × Rate` — charges by meters

### Soft Delete
Deleted transactions are hidden (`deleted_at` set) but not removed from DB. Balance is reversed on delete.

### Edit History
Every edit to a transaction saves a snapshot of the old values in `transaction_edits` table.

---

## Expenses

Standalone business expenses (not linked to a customer).

Categories: Diesel, Salary, Driver Fee, Other.

Tracked separately from transactions. Appear in Dashboard expense total and Account ledgers.

---

## Customers

List of all customers with current balance.

**Balance meaning:**
- Positive (green) → customer owes you (To Receive)
- Negative (red) → you owe customer (To Pay)

Month dropdown filters which period's ledger opens when you tap a customer.

**Opening Balance:** set when creating customer — pre-existing debt/credit before using OpTrack.

---

## Customer Ledger (`/ledger.html?id=X`)

Full transaction history for one customer. Filterable by month.

Shows each transaction with: date, type, product, amount, paid, pending, notes.

Running balance shown per entry.

---

## Accounts

Tracks money across internal accounts (Cash, Company, Siva, Padma, etc.).

### In / Out Definition
- **In** — money received INTO this account (e.g. customer pays cash → Cash In)
- **Out** — money sent OUT of this account (e.g. you pay someone from Company → Company Out)
- **Expense** — expense paid from this account
- **Net** = In − Out − Expenses

Default accounts: Cash, Company, Siva, Padma, Narayana swami, Vinod, Anji, Other.

### Account Ledger
Full transaction history filtered by account. Shows every transaction tagged to that account.

---

## Stock

Tracks 3 inventory items: Drip, Dhana, Dipper.

### Section 1 — Total Stock Summary

**Drip table:** `Type | Coating | Quantity | Meters | Weight (kg)`
- Groups production entries by `(drip_type, meters, weight, coating)` tuple
- Same spec → quantity accumulates in one row
- `drip_type`: Inline or Online
- `meters` + `weight` = per-unit spec (e.g. 400m per roll, 14kg per roll) — these define the product type
- `coating`: Yes/No
- Consumption entries subtract from quantity

**Dhana table:** `Purchased (bags) | Production (bags) | Consumed (bags) | Current`
- Current = value in stock table (maintained by DB triggers via API)

**Dipper table:** `Stock` — current quantity

### Section 2 — Stock Entries (Unified Log)

Unified table of all stock movements: both production entries AND sale/purchase transactions.

Sources:
- Production entries (drip production/consumption, dhana purchase/production/consumption, dipper consumption)
- SALE transactions with item_type drip/dhana/dipper
- PURCHASE transactions with item_type drip/dhana/dipper

Movement chips:
| Chip | Meaning |
|------|---------|
| Purchase (blue) | Bought stock |
| Production (green) | Manufactured/added |
| Consumption (red) | Used up internally |
| Sale (orange-red) | Sold to customer |

Only production entries have a delete button (transactions deleted from Transactions page).

### Stock Entry Form

Fields vary by item:

**Drip:**
- Type: Inline / Online
- Coating: Yes / No (default No)
- Worker, Shift (Day/Night), Date
- Quantity, Meters, Weight
- Notes

**Dhana:**
- Category: Purchase / Production / Consumption
- Bags, Worker, Shift, Date, Notes

**Dipper:**
- Category: Consumption (only)
- Quantity, Worker, Shift, Date, Notes

### Stock Adjustment on Events

| Event | Effect |
|-------|--------|
| Production entry added | +stock |
| Consumption entry added | −stock |
| Purchase entry added | +stock |
| Production entry deleted | reverses |
| SALE transaction saved | −stock |
| PURCHASE transaction saved | +stock |
| SALE transaction deleted | +stock (reversed) |

---

## Users (Admin only)

Create and delete users. Roles: `admin` or `user`.

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `customers` | Customer list with balance |
| `transactions` | All financial entries |
| `transaction_edits` | Edit history snapshots |
| `production` | Stock production/consumption entries |
| `stock` | Running stock totals (drip/dhana/dipper) |
| `accounts` | Account definitions |
| `users` | Login users |

### Key Columns — transactions
`transaction_type`, `item_type`, `quantity`, `meters`, `weight`, `bags`, `rate`, `total`, `paid_amount`, `pending_amount`, `account_id`, `expense_category`, `deleted_at`, `notes`, `created_at`

### Key Columns — production
`item_type`, `entry_type`, `drip_type`, `coating`, `quantity`, `meters`, `weight`, `bags`, `worker`, `shift`, `date`, `notes`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/transactions` | List transactions |
| GET | `/api/transactions/summary` | Aggregated totals |
| GET | `/api/transactions/months` | Distinct months with data |
| GET | `/api/transactions/customer/:id` | Customer transactions |
| POST | `/api/transactions` | Create transaction |
| PUT | `/api/transactions/:id` | Edit transaction |
| DELETE | `/api/transactions/:id` | Soft delete transaction |
| GET | `/api/production` | List production entries |
| POST | `/api/production` | Add production entry |
| DELETE | `/api/production/:id` | Delete production entry |
| GET | `/api/stock` | Current stock totals |
| GET | `/api/stock/movements` | Unified stock movements log |
| POST | `/api/stock/reset` | Reset stock to 0 (admin only) |
| GET | `/api/accounts` | List accounts with totals |
| GET | `/api/accounts/:id` | Account detail with ledger |
| GET | `/api/expenses` | List expenses |
| GET | `/api/users` | List users (admin only) |
| POST | `/api/users` | Create user (admin only) |
| DELETE | `/api/users/:id` | Delete user (admin only) |

---

## Period Filtering

Most pages support month filtering via dropdown (populated from actual transaction months in DB).

Pages with month filter: Dashboard, Transactions, Expenses, Customers, Customer Ledger, Account Ledger.

Selecting a month on Customers page passes `start_date` + `end_date` to ledger URL when tapping a customer.

---

## Backup

Data backup script: run manually via node to dump all tables to JSON.
Backup stored in `/backup/dump_YYYY-MM-DD.json`.
