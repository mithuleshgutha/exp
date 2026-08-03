/**
 * Run once: node scripts/full_reset.js
 * Backs up ALL tables to JSON, then truncates ALL data (users, accounts,
 * customers, transactions, transaction_edits, production, stock).
 * Schema is untouched. Re-seeds default admin user + default accounts +
 * default stock rows so the app is usable again immediately after.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Pool } = require("pg");
const bcrypt   = require("bcryptjs");
const fs       = require("fs");
const path     = require("path");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TABLES = ["users", "accounts", "customers", "transactions", "transaction_edits", "production", "stock"];
const DEFAULT_ACCOUNTS = ["Cash", "Company", "Siva", "Padma", "Narayana swami", "Vinod", "Anji", "Other"];

async function run() {
    const client = await pool.connect();
    try {
        console.log("Connected to Supabase.\n");

        // ── 1. Backup everything ──
        const backup = {};
        for (const t of TABLES) {
            const r = await client.query(`SELECT * FROM ${t}`);
            backup[t] = r.rows;
            console.log(`  backed up ${t}: ${r.rows.length} rows`);
        }
        const pad  = n => String(n).padStart(2, "0");
        const now  = new Date();
        const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        const file = path.join(__dirname, `../backup/full_dump_${date}.json`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(backup, null, 2));
        console.log(`\nBackup saved -> ${file}\n`);

        // ── 2. Wipe everything (schema untouched) ──
        console.log("Truncating all tables...");
        await client.query("BEGIN");
        await client.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
        await client.query("COMMIT");
        console.log("All tables truncated, IDs reset to 1.\n");

        // ── 3. Reseed minimum viable state ──
        console.log("Reseeding default admin user, accounts, stock rows...");

        const hash = await bcrypt.hash("admin123", 10);
        await client.query(
            "INSERT INTO users (name, username, password, role) VALUES ($1,$2,$3,$4)",
            ["Admin", "admin", hash, "admin"]
        );

        for (const name of DEFAULT_ACCOUNTS) {
            await client.query("INSERT INTO accounts (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
        }

        for (const itemType of ["drip", "dhana", "dipper"]) {
            await client.query("INSERT INTO stock (item_type) VALUES ($1) ON CONFLICT (item_type) DO NOTHING", [itemType]);
        }

        console.log("\nDone. Database fully reset.");
        console.log("  Login  -> username: admin  password: admin123  (change after first login)");
        console.log(`  Accounts recreated: ${DEFAULT_ACCOUNTS.join(", ")}`);
        console.log("  Stock rows recreated: drip, dhana, dipper (all zeroed)");

    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Error:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
