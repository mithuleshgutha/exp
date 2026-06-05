const express = require("express");
const router  = express.Router();
const pool    = require("../db/db");

router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM stock ORDER BY item_type");
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── GET /movements — unified production + transaction movements ── */
router.get("/movements", async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        const params = [];

        let prodWhere = "WHERE p.item_type IN ('drip','dhana','dipper')";
        let txWhere   = "WHERE t.item_type IN ('drip','dhana','dipper') AND t.transaction_type IN ('SALE','PURCHASE') AND t.deleted_at IS NULL";

        if (date_from) {
            params.push(date_from);
            prodWhere += ` AND p.date >= $${params.length}`;
            params.push(date_from);
            txWhere   += ` AND DATE(t.created_at) >= $${params.length}`;
        }
        if (date_to) {
            params.push(date_to);
            prodWhere += ` AND p.date <= $${params.length}`;
            params.push(date_to);
            txWhere   += ` AND DATE(t.created_at) <= $${params.length}`;
        }

        const result = await pool.query(`
            SELECT
                p.date::text       AS date,
                p.item_type,
                'entry'            AS source,
                p.entry_type       AS movement_type,
                p.quantity, p.meters, p.weight, p.bags,
                p.worker, p.notes, p.drip_type,
                COALESCE(p.coating, FALSE) AS coating,
                p.id               AS entry_id,
                NULL::integer      AS tx_id,
                NULL::text         AS customer_name
            FROM production p ${prodWhere}

            UNION ALL

            SELECT
                DATE(t.created_at)::text          AS date,
                t.item_type,
                'transaction'                     AS source,
                LOWER(t.transaction_type)         AS movement_type,
                t.quantity, t.meters, t.weight, t.bags,
                NULL                              AS worker,
                t.notes, NULL                     AS drip_type,
                FALSE                             AS coating,
                NULL::integer                     AS entry_id,
                t.id                              AS tx_id,
                COALESCE(c.name,'')               AS customer_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${txWhere}

            ORDER BY date DESC, entry_id DESC NULLS LAST
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.post("/reset", async (req, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
    try {
        await pool.query(`UPDATE stock SET quantity=0, meters=0, weight=0, bags=0, updated_at=NOW()`);
        await pool.query(`DELETE FROM production`);
        res.json({ success: true });
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
