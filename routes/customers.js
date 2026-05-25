const express = require("express");
const router = express.Router();
const pool = require("../db/db");

// ADD CUSTOMER
router.post("/", async (req, res) => {
    try {
        const { name, phone, address, opening_balance } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Customer name is required" });
        }

        const ob = parseFloat(opening_balance) || 0;

        const result = await pool.query(
            `INSERT INTO customers (name, phone, address, opening_balance, current_balance)
             VALUES ($1, $2, $3, $4, $4)
             RETURNING *`,
            [name.trim(), phone || null, address || null, ob]
        );

        const customer = result.rows[0];

        // Generate and save customer_uid
        const uid = "CUS-" + String(customer.id).padStart(4, "0");
        await pool.query(
            "UPDATE customers SET customer_uid = $1 WHERE id = $2",
            [uid, customer.id]
        );

        customer.customer_uid = uid;
        res.json(customer);

    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

// GET ALL CUSTOMERS (with aggregated totals)
router.get("/", async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*,
                COALESCE(SUM(CASE WHEN t.transaction_type='SALE'     AND t.deleted_at IS NULL THEN t.total ELSE 0 END), 0) AS total_sale,
                COALESCE(SUM(CASE WHEN t.transaction_type='PURCHASE' AND t.deleted_at IS NULL THEN t.total ELSE 0 END), 0) AS total_purchase
            FROM customers c
            LEFT JOIN transactions t ON t.customer_id = c.id
            GROUP BY c.id
            ORDER BY c.name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

// GET BALANCE SUMMARY (receivable / payable, netted per customer)
router.get("/balances", async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, customer_uid, current_balance
             FROM customers
             WHERE current_balance != 0
             ORDER BY ABS(current_balance) DESC`
        );
        const receivable = result.rows.filter(c => c.current_balance > 0);
        const payable    = result.rows.filter(c => c.current_balance < 0);
        res.json({
            total_receivable: receivable.reduce((s, c) => s + parseFloat(c.current_balance), 0),
            total_payable:    payable.reduce((s, c)    => s + Math.abs(parseFloat(c.current_balance)), 0),
            receivable_customers: receivable,
            payable_customers:    payable
        });
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

// PATCH opening balance — recalculates current_balance preserving transaction effects
router.patch("/:id/opening-balance", async (req, res) => {
    try {
        const id     = parseInt(req.params.id);
        const newOB  = parseFloat(req.body.opening_balance);
        if (isNaN(newOB)) return res.status(400).json({ error: "opening_balance required" });

        const cur = await pool.query("SELECT opening_balance, current_balance FROM customers WHERE id=$1", [id]);
        if (!cur.rows.length) return res.status(404).json({ error: "Not found" });

        const oldOB     = parseFloat(cur.rows[0].opening_balance) || 0;
        const oldCurrent = parseFloat(cur.rows[0].current_balance) || 0;
        const txEffect  = oldCurrent - oldOB;          // running tx delta preserved
        const newCurrent = newOB + txEffect;

        const result = await pool.query(
            `UPDATE customers SET opening_balance=$1, current_balance=$2 WHERE id=$3 RETURNING *`,
            [newOB, newCurrent, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

// GET SINGLE CUSTOMER (with transaction totals)
router.get("/:id", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*,
                COALESCE(SUM(CASE WHEN t.transaction_type='SALE'     AND t.deleted_at IS NULL THEN t.total ELSE 0 END), 0) AS total_sale,
                COALESCE(SUM(CASE WHEN t.transaction_type='PURCHASE' AND t.deleted_at IS NULL THEN t.total ELSE 0 END), 0) AS total_purchase
            FROM customers c
            LEFT JOIN transactions t ON t.customer_id = c.id
            WHERE c.id = $1
            GROUP BY c.id
        `, [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
