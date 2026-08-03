const express = require("express");
const router  = express.Router();
const pool    = require("../db/db");
const bcrypt  = require("bcryptjs");

function adminOnly(req, res, next) {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
    next();
}

router.get("/", adminOnly, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, name, username, role, created_at FROM users ORDER BY created_at ASC"
        );
        res.json(result.rows);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.post("/", adminOnly, async (req, res) => {
    try {
        const { name, username, password, role } = req.body;
        if (!name?.trim() || !username?.trim() || !password)
            return res.status(400).json({ error: "Name, username and password required" });

        const exists = await pool.query("SELECT id FROM users WHERE username = $1", [username.trim()]);
        if (exists.rows.length) return res.status(400).json({ error: "Username already taken" });

        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            "INSERT INTO users (name, username, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, username, role, created_at",
            [name.trim(), username.trim(), hash, role === "admin" ? "admin" : "user"]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

router.delete("/:id", adminOnly, async (req, res) => {
    try {
        const targetId = parseInt(req.params.id);
        if (targetId === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });

        const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [targetId]);
        if (!result.rows.length) return res.status(404).json({ error: "User not found" });
        res.json({ success: true });
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
