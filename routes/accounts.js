const express = require("express");
const router  = express.Router();
const pool    = require("../db/db");

router.get("/", async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.id, a.name, a.created_at,
                COALESCE(SUM(CASE WHEN t.transaction_type='PAYMENT_IN'  AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN t.transaction_type='PAYMENT_OUT' AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_out,
                COALESCE(SUM(CASE WHEN t.transaction_type='EXPENSE'     AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_expense
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id
            GROUP BY a.id
            ORDER BY a.name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.get("/:id", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.id, a.name, a.created_at,
                COALESCE(SUM(CASE WHEN t.transaction_type='PAYMENT_IN'  AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN t.transaction_type='PAYMENT_OUT' AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_out,
                COALESCE(SUM(CASE WHEN t.transaction_type='EXPENSE'     AND t.deleted_at IS NULL THEN t.paid_amount ELSE 0 END), 0) AS total_expense
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id
            WHERE a.id = $1
            GROUP BY a.id
        `, [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: "Not found" });
        res.json(result.rows[0]);
    } catch (err) {
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
