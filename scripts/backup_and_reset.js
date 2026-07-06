require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Pool } = require("pg");
const fs       = require("fs");
const path     = require("path");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
    const client = await pool.connect();
    try {
        console.log("Connected to Supabase.");

        // ── 1. Backup ──
        const tables = ["users","accounts","customers","transactions","transaction_edits","production","stock"];
        const backup = {};
        for (const t of tables) {
            const r = await client.query(`SELECT * FROM ${t}`);
            backup[t] = r.rows;
            console.log(`  ${t}: ${r.rows.length} rows`);
        }

        const pad  = n => String(n).padStart(2,"0");
        const now  = new Date();
        const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        const file = path.join(__dirname, `../backup/dump_${date}.json`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(backup, null, 2));
        console.log(`\nBackup saved → ${file}`);

        // ── 2. Reset (truncate data, keep schema + users + accounts + stock rows) ──
        console.log("\nTruncating tables…");
        await client.query("TRUNCATE transaction_edits CASCADE");
        await client.query("TRUNCATE transactions    CASCADE");
        await client.query("TRUNCATE production      CASCADE");
        await client.query("TRUNCATE customers       CASCADE");
        await client.query("UPDATE stock SET quantity=0, meters=0, weight=0, bags=0, updated_at=NOW()");
        await client.query("UPDATE accounts SET opening_balance=0");
        console.log("Done. Kept: users, accounts (names only, OB reset to 0), stock rows (zeroed).");
        console.log("Cleared: customers, transactions, transaction_edits, production.");

    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
