const express = require("express");
const router  = express.Router();
const pool    = require("../db/db");

async function applyStock(pool, itemType, qty, meters, weight, bags, sign, entryType) {
    // production → adds to stock; consumption → removes from stock
    const s = entryType === "consumption" ? -sign : sign;
    if (itemType === "drip") {
        await pool.query(
            `UPDATE stock SET quantity=quantity+$1, meters=meters+$2, weight=weight+$3, updated_at=NOW() WHERE item_type='drip'`,
            [s * qty, s * meters, s * weight]
        );
    } else if (itemType === "dhana") {
        await pool.query(
            `UPDATE stock SET bags=bags+$1, updated_at=NOW() WHERE item_type='dhana'`,
            [s * bags]
        );
    } else if (itemType === "dipper") {
        await pool.query(
            `UPDATE stock SET quantity=quantity+$1, updated_at=NOW() WHERE item_type='dipper'`,
            [s * qty]
        );
    }
}

/* ── GET / ── */
router.get("/", async (req, res) => {
    try {
        const { item_type, date_from, date_to } = req.query;
        let query = "SELECT * FROM production WHERE 1=1";
        const params = [];

        if (item_type) { params.push(item_type); query += ` AND item_type = $${params.length}`; }
        if (date_from)  { params.push(date_from);  query += ` AND date >= $${params.length}`; }
        if (date_to)    { params.push(date_to);    query += ` AND date <= $${params.length}`; }

        query += " ORDER BY date DESC, created_at DESC";
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── POST / ── */
router.post("/", async (req, res) => {
    try {
        const { item_type, worker, shift, date, quantity, meters, weight, bags, notes,
                entry_type, drip_type } = req.body;
        if (!item_type) return res.status(400).json({ error: "item_type required" });

        const qty = parseFloat(quantity) || 0;
        const mts = parseFloat(meters)   || 0;
        const wt  = parseFloat(weight)   || 0;
        const bg  = parseFloat(bags)     || 0;
        const et  = entry_type || "production";

        const result = await pool.query(
            `INSERT INTO production (item_type, worker, shift, date, quantity, meters, weight, bags, notes, entry_type, drip_type)
             VALUES ($1,$2,$3,COALESCE($4::DATE,CURRENT_DATE),$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [item_type, worker || null, shift || "day", date || null,
             qty, mts, wt, bg, notes || null, et, drip_type || null]
        );

        await applyStock(pool, item_type, qty, mts, wt, bg, +1, et);
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

/* ── DELETE /:id ── */
router.delete("/:id", async (req, res) => {
    try {
        const id  = parseInt(req.params.id);
        const cur = await pool.query("SELECT * FROM production WHERE id = $1", [id]);
        if (!cur.rows.length) return res.status(404).json({ error: "Not found" });

        const p = cur.rows[0];
        await pool.query("DELETE FROM production WHERE id = $1", [id]);
        await applyStock(pool, p.item_type,
            parseFloat(p.quantity), parseFloat(p.meters), parseFloat(p.weight), parseFloat(p.bags),
            -1, p.entry_type || "production");
        res.json({ success: true });
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
