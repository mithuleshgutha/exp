const express = require("express");
const router  = express.Router();
const pool    = require("../db/db");

const ACCT_SELECT = `
    SELECT a.id, a.name, a.opening_balance, a.created_at,
        COALESCE(SUM(CASE WHEN t.transaction_type='PAYMENT_IN'  AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN t.transaction_type='PAYMENT_OUT' AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_out,
        COALESCE(SUM(CASE WHEN t.transaction_type='EXPENSE'     AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_expense
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
`;

router.get("/", async (_req, res) => {
    try {
        const result = await pool.query(ACCT_SELECT + " GROUP BY a.id ORDER BY a.name ASC");
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.get("/:id", async (req, res) => {
    try {
        const result = await pool.query(ACCT_SELECT + " WHERE a.id = $1 GROUP BY a.id", [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: "Not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.patch("/:id/opening-balance", async (req, res) => {
    try {
        const ob = parseFloat(req.body.opening_balance);
        if (isNaN(ob)) return res.status(400).json({ error: "opening_balance required" });
        const result = await pool.query(
            "UPDATE accounts SET opening_balance=$1 WHERE id=$2 RETURNING *",
            [ob, req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: "Not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.post("/transfer", async (req, res) => {
    const { from_account_id, to_account_id, amount, notes } = req.body;
    const amt = parseFloat(amount);
    if (!from_account_id || !to_account_id) return res.status(400).json({ error: "from_account_id and to_account_id required" });
    if (isNaN(amt) || amt <= 0)             return res.status(400).json({ error: "amount must be positive" });
    if (from_account_id === to_account_id)  return res.status(400).json({ error: "Cannot transfer to same account" });
    try {
        const [fromRes, toRes] = await Promise.all([
            pool.query("SELECT name FROM accounts WHERE id=$1", [from_account_id]),
            pool.query("SELECT name FROM accounts WHERE id=$1", [to_account_id])
        ]);
        if (!fromRes.rows.length || !toRes.rows.length) return res.status(404).json({ error: "Account not found" });
        const fromName = fromRes.rows[0].name;
        const toName   = toRes.rows[0].name;
        const txNote   = notes?.trim() || `Transfer: ${fromName} → ${toName}`;

        await pool.query("BEGIN");
        await pool.query(
            `INSERT INTO transactions (transaction_type, account_id, paid_amount, notes) VALUES ('PAYMENT_OUT', $1, $2, $3)`,
            [from_account_id, amt, txNote]
        );
        await pool.query(
            `INSERT INTO transactions (transaction_type, account_id, paid_amount, notes) VALUES ('PAYMENT_IN', $1, $2, $3)`,
            [to_account_id, amt, txNote]
        );
        await pool.query("COMMIT");
        res.json({ success: true });
    } catch (err) {
        await pool.query("ROLLBACK");
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.post("/", async (req, res) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Name required" });
        const result = await pool.query(
            "INSERT INTO accounts (name) VALUES ($1) RETURNING *",
            [name.trim()]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === "23505") return res.status(400).json({ error: "Account name already exists" });
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
