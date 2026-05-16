const express = require("express");
const router  = express.Router();
const pool    = require("../db/db");

/* ── helpers ── */

async function resolveCustomer(pool, name, id, openingBalance = 0) {
    if (id) return parseInt(id);

    const existing = await pool.query(
        "SELECT id FROM customers WHERE LOWER(name) = LOWER($1)", [name.trim()]
    );
    if (existing.rows.length) return existing.rows[0].id;

    const ob = parseFloat(openingBalance) || 0;
    const newCust = await pool.query(
        "INSERT INTO customers (name, opening_balance, current_balance) VALUES ($1, $2, $2) RETURNING id",
        [name.trim(), ob]
    );
    const newId = newCust.rows[0].id;
    const uid = "CUS-" + String(newId).padStart(4, "0");
    await pool.query("UPDATE customers SET customer_uid = $1 WHERE id = $2", [uid, newId]);
    return newId;
}

async function applyBalance(pool, type, custId, pending, paid, sign) {
    const s = sign;
    if (type === "SALE")         await pool.query("UPDATE customers SET current_balance = current_balance + $1 WHERE id = $2", [s * pending, custId]);
    else if (type === "PURCHASE")     await pool.query("UPDATE customers SET current_balance = current_balance - $1 WHERE id = $2", [s * pending, custId]);
    else if (type === "PAYMENT_IN")   await pool.query("UPDATE customers SET current_balance = current_balance - $1 WHERE id = $2", [s * paid,    custId]);
    else if (type === "PAYMENT_OUT")  await pool.query("UPDATE customers SET current_balance = current_balance + $1 WHERE id = $2", [s * paid,    custId]);
}

async function applyStock(pool, itemType, txType, qty, meters, weight, bags, sign) {
    if (!itemType) return;
    if (itemType === "drip") {
        // PURCHASE → increase stock, SALE → decrease stock
        const s = txType === "PURCHASE" ? sign : -sign;
        await pool.query(
            `UPDATE stock SET quantity=quantity+$1, meters=meters+$2, weight=weight+$3, updated_at=NOW() WHERE item_type='drip'`,
            [s * qty, s * meters, s * weight]
        );
    } else if (itemType === "dhana") {
        const delta = txType === "PURCHASE" ? sign * bags : -sign * bags;
        await pool.query(
            `UPDATE stock SET bags=bags+$1, updated_at=NOW() WHERE item_type='dhana'`,
            [delta]
        );
    } else if (itemType === "dipper") {
        const s = txType === "PURCHASE" ? sign : -sign;
        await pool.query(
            `UPDATE stock SET quantity=quantity+$1, updated_at=NOW() WHERE item_type='dipper'`,
            [s * qty]
        );
    }
    // scrap: no stock effect
}

const TX_WITH_EDITS = `
    SELECT t.*, COALESCE(c.name, '') AS customer_name, c.customer_uid,
           (SELECT COUNT(*) FROM transaction_edits WHERE transaction_id = t.id) AS edit_count
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
`;

/* ── GET /months — distinct year-months that have transactions ── */
router.get("/months", async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT TO_CHAR(created_at, 'YYYY-MM') AS month
            FROM transactions
            WHERE deleted_at IS NULL
            GROUP BY month
            ORDER BY month DESC
        `);
        res.json(result.rows.map(r => r.month));
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── GET /summary ── */
router.get("/summary", async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let where = "WHERE deleted_at IS NULL";
        const params = [];
        if (start_date) { params.push(start_date); where += ` AND DATE(created_at) >= $${params.length}`; }
        if (end_date)   { params.push(end_date);   where += ` AND DATE(created_at) <= $${params.length}`; }

        const result = await pool.query(`
            SELECT
                COALESCE(SUM(CASE WHEN transaction_type='SALE'        THEN total        ELSE 0 END), 0) AS total_sale,
                COALESCE(SUM(CASE WHEN transaction_type='PURCHASE'    THEN total        ELSE 0 END), 0) AS total_purchase,
                COALESCE(SUM(CASE WHEN transaction_type='EXPENSE'     THEN paid_amount  ELSE 0 END), 0) AS total_expense,
                COALESCE(SUM(CASE WHEN transaction_type='PAYMENT_IN'  THEN paid_amount  ELSE 0 END), 0) AS total_payment_in,
                COALESCE(SUM(CASE WHEN transaction_type='PAYMENT_OUT' THEN paid_amount  ELSE 0 END), 0) AS total_payment_out,
                COALESCE(SUM(CASE WHEN transaction_type='SALE'        THEN pending_amount ELSE 0 END), 0) AS pending_receivable,
                COALESCE(SUM(CASE WHEN transaction_type='PURCHASE'    THEN pending_amount ELSE 0 END), 0) AS pending_payable
            FROM transactions ${where}
        `, params);
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── GET / (with filters) ── */
router.get("/", async (req, res) => {
    try {
        const { customer_name, start_date, end_date, type, account_id } = req.query;
        let query = TX_WITH_EDITS + " WHERE 1=1";
        const params = [];

        if (customer_name) { params.push(`%${customer_name}%`); query += ` AND LOWER(c.name) LIKE LOWER($${params.length})`; }
        if (type)          { params.push(type);      query += ` AND t.transaction_type = $${params.length}`; }
        if (start_date)    { params.push(start_date);            query += ` AND DATE(t.created_at) >= $${params.length}`; }
        if (end_date)      { params.push(end_date);              query += ` AND DATE(t.created_at) <= $${params.length}`; }
        if (account_id)    { params.push(account_id);            query += ` AND t.account_id = $${params.length}`; }

        // item_type filter (used by expenses page and category filter)
        const { item_type, expense_category: expCatFilter } = req.query;
        if (item_type)      { params.push(item_type);      query += ` AND t.item_type = $${params.length}`; }
        if (expCatFilter)   { params.push(expCatFilter);   query += ` AND t.expense_category = $${params.length}`; }

        query += " ORDER BY t.created_at DESC";

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── GET /customer/:id ── */
router.get("/customer/:id", async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let query = TX_WITH_EDITS + " WHERE t.customer_id = $1";
        const params = [req.params.id];
        if (start_date) { params.push(start_date); query += ` AND DATE(t.created_at) >= $${params.length}`; }
        if (end_date)   { params.push(end_date);   query += ` AND DATE(t.created_at) <= $${params.length}`; }
        query += " ORDER BY t.created_at DESC";
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── GET /:id/history ── */
router.get("/:id/history", async (req, res) => {
    try {
        const txId = parseInt(req.params.id);

        const edits = await pool.query(
            `SELECT h.id, h.old_snapshot, h.edited_at, u.name AS editor_name
             FROM transaction_edits h
             LEFT JOIN users u ON h.edited_by = u.id
             WHERE h.transaction_id = $1
             ORDER BY h.edited_at ASC`,
            [txId]
        );

        const current = await pool.query(
            `SELECT t.*, COALESCE(c.name, '') AS customer_name
             FROM transactions t
             LEFT JOIN customers c ON t.customer_id = c.id
             WHERE t.id = $1`,
            [txId]
        );

        res.json({ edits: edits.rows, current: current.rows[0] });
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── POST / (add transaction) ── */
router.post("/", async (req, res) => {
    try {
        const { customer_name, customer_id, transaction_type,
                quantity, rate, paid_amount, notes, created_at: txDate,
                item_type, meters, weight, bags, total: totalOverride, account_id,
                expense_category, opening_balance } = req.body;

        const isExpense = transaction_type === "EXPENSE";
        let custId = null;
        if (!isExpense) {
            if (!customer_name?.trim()) return res.status(400).json({ error: "Customer name required" });
            custId = await resolveCustomer(pool, customer_name, customer_id, opening_balance);
        }

        const qty  = parseFloat(quantity)    || 0;
        const rt   = parseFloat(rate)        || 0;
        const paid = parseFloat(paid_amount) || 0;
        const mts  = parseFloat(meters)      || 0;
        const wt   = parseFloat(weight)      || 0;
        const bg   = parseFloat(bags)        || 0;

        const isPayment  = transaction_type === "PAYMENT_IN" || transaction_type === "PAYMENT_OUT";
        const billingQty = item_type === "dhana" ? bg : qty;
        const total      = (isPayment || isExpense) ? paid
            : (totalOverride != null ? parseFloat(totalOverride) : billingQty * rt);
        const pending    = (isPayment || isExpense) ? 0 : total - paid;

        const acctId  = account_id ? parseInt(account_id) : null;
        const expCat  = expense_category || null;
        const result = await pool.query(
            `INSERT INTO transactions
             (customer_id, transaction_type, quantity, rate,
              total, paid_amount, pending_amount, notes, created_at,
              item_type, meters, weight, bags, account_id, expense_category)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::TIMESTAMP,NOW()),$10,$11,$12,$13,$14,$15)
             RETURNING *`,
            [custId, transaction_type, qty, rt,
             total, paid, pending, notes || null, txDate || null,
             item_type || null, mts, wt, bg, acctId, expCat]
        );

        if (!isExpense) await applyBalance(pool, transaction_type, custId, pending, paid, +1);
        await applyStock(pool, item_type, transaction_type, qty, mts, wt, bg, +1);
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── PUT /:id (edit transaction) ── */
router.put("/:id", async (req, res) => {
    try {
        const txId = parseInt(req.params.id);
        const { customer_name, customer_id, transaction_type,
                quantity, rate, paid_amount, notes, created_at: txDate,
                item_type, meters, weight, bags, total: totalOverride, account_id,
                expense_category } = req.body;

        const cur = await pool.query(
            `SELECT t.*, COALESCE(c.name, '') AS customer_name
             FROM transactions t LEFT JOIN customers c ON t.customer_id = c.id
             WHERE t.id = $1 AND t.deleted_at IS NULL`,
            [txId]
        );
        if (!cur.rows.length) return res.status(404).json({ error: "Not found or deleted" });
        const old = cur.rows[0];

        await pool.query(
            `INSERT INTO transaction_edits (transaction_id, old_snapshot, edited_by)
             VALUES ($1, $2, $3)`,
            [txId, JSON.stringify(old), req.user?.id || null]
        );

        // Reverse old balance + stock
        if (old.transaction_type !== "EXPENSE")
            await applyBalance(pool, old.transaction_type, old.customer_id,
                parseFloat(old.pending_amount), parseFloat(old.paid_amount), -1);
        await applyStock(pool, old.item_type, old.transaction_type,
            parseFloat(old.quantity), parseFloat(old.meters), parseFloat(old.weight), parseFloat(old.bags), -1);

        const isExpense  = transaction_type === "EXPENSE";
        const isPayment  = transaction_type === "PAYMENT_IN" || transaction_type === "PAYMENT_OUT";
        let newCustId = null;
        if (!isExpense) {
            newCustId = await resolveCustomer(pool, customer_name || old.customer_name, customer_id);
        }

        const qty  = parseFloat(quantity)    || 0;
        const rt   = parseFloat(rate)        || 0;
        const paid = parseFloat(paid_amount) || 0;
        const mts  = parseFloat(meters)      || 0;
        const wt   = parseFloat(weight)      || 0;
        const bg   = parseFloat(bags)        || 0;

        const billingQty = item_type === "dhana" ? bg : qty;
        const total      = (isPayment || isExpense) ? paid
            : (totalOverride != null ? parseFloat(totalOverride) : billingQty * rt);
        const pending    = (isPayment || isExpense) ? 0 : total - paid;

        const acctId = account_id ? parseInt(account_id) : null;
        const expCat = expense_category || null;
        await pool.query(
            `UPDATE transactions SET
                customer_id      = $1,  transaction_type = $2,
                quantity         = $3,  rate             = $4,
                total            = $5,  paid_amount      = $6,
                pending_amount   = $7,  notes            = $8,
                created_at       = COALESCE($9::TIMESTAMP, created_at),
                item_type        = $10, meters           = $11,
                weight           = $12, bags             = $13,
                account_id       = $15, expense_category = $16
             WHERE id = $14`,
            [newCustId, transaction_type,
             qty, rt, total, paid, pending, notes || null, txDate || null,
             item_type || null, mts, wt, bg, txId, acctId, expCat]
        );

        if (!isExpense) await applyBalance(pool, transaction_type, newCustId, pending, paid, +1);
        await applyStock(pool, item_type, transaction_type, qty, mts, wt, bg, +1);

        const updated = await pool.query(TX_WITH_EDITS + " WHERE t.id = $1", [txId]);
        res.json(updated.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── DELETE /:id (soft delete) ── */
router.delete("/:id", async (req, res) => {
    try {
        const txId = parseInt(req.params.id);

        const cur = await pool.query(
            "SELECT * FROM transactions WHERE id = $1", [txId]
        );
        if (!cur.rows.length) return res.status(404).json({ error: "Not found" });

        const t = cur.rows[0];
        if (t.deleted_at) return res.status(400).json({ error: "Already deleted" });

        await pool.query("UPDATE transactions SET deleted_at = NOW() WHERE id = $1", [txId]);

        if (t.transaction_type !== "EXPENSE")
            await applyBalance(pool, t.transaction_type, t.customer_id,
                parseFloat(t.pending_amount), parseFloat(t.paid_amount), -1);
        await applyStock(pool, t.item_type, t.transaction_type,
            parseFloat(t.quantity), parseFloat(t.meters), parseFloat(t.weight), parseFloat(t.bags), -1);

        res.json({ success: true });
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
