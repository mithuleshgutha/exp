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

router.post("/reset", async (req, res) => {
    try {
        await pool.query(`UPDATE stock SET quantity=0, meters=0, weight=0, bags=0, updated_at=NOW()`);
        res.json({ success: true });
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
