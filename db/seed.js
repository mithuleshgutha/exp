/**
 * Run once: node db/seed.js
 * Creates a default admin user.
 * Change the password after first login.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const pool = require("./db");
const bcrypt = require("bcryptjs");

async function seed() {
    try {
        const name     = "Admin";
        const username = "admin";
        const password = "admin123";
        const role     = "admin";

        const exists = await pool.query(
            "SELECT id FROM users WHERE username = $1",
            [username]
        );

        if (exists.rows.length > 0) {
            console.log("Admin user already exists — skipping.");
            process.exit(0);
        }

        const hash = await bcrypt.hash(password, 10);

        await pool.query(
            "INSERT INTO users (name, username, password, role) VALUES ($1, $2, $3, $4)",
            [name, username, hash, role]
        );

        console.log(`Created user:`);
        console.log(`  Username: ${username}`);
        console.log(`  Password: ${password}`);
        process.exit(0);
    } catch (err) {
        console.error("Seed error:", err.message);
        process.exit(1);
    }
}

seed();


