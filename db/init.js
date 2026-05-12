const pool = require("./db");

async function initDB() {
    try {
        // Customers table (ensure it exists with all columns)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(30),
                address TEXT,
                opening_balance NUMERIC(14,2) DEFAULT 0,
                current_balance NUMERIC(14,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Add customer_uid column if missing
        await pool.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS customer_uid VARCHAR(20) UNIQUE
        `);

        // Backfill customer_uid for existing rows
        await pool.query(`
            UPDATE customers
            SET customer_uid = 'CUS-' || LPAD(id::TEXT, 4, '0')
            WHERE customer_uid IS NULL
        `);

        // Transactions table (ensure it exists)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER REFERENCES customers(id),
                product VARCHAR(100),
                transaction_type VARCHAR(50) NOT NULL,
                quantity NUMERIC(14,2) DEFAULT 0,
                rate NUMERIC(14,2) DEFAULT 0,
                total NUMERIC(14,2) DEFAULT 0,
                paid_amount NUMERIC(14,2) DEFAULT 0,
                pending_amount NUMERIC(14,2) DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Soft-delete support
        await pool.query(`
            ALTER TABLE transactions
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
        `);

        // Edit history table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS transaction_edits (
                id SERIAL PRIMARY KEY,
                transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
                old_snapshot JSONB NOT NULL,
                edited_by INTEGER REFERENCES users(id),
                edited_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id         SERIAL PRIMARY KEY,
                name       VARCHAR(255) NOT NULL,
                username   VARCHAR(100) UNIQUE,
                password   VARCHAR(255) NOT NULL,
                role       VARCHAR(50)  DEFAULT 'user',
                created_at TIMESTAMP    DEFAULT NOW()
            )
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE
        `);

        // Stock tracking columns on transactions
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS item_type VARCHAR(20)`);
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS meters NUMERIC(14,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS weight NUMERIC(14,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bags   NUMERIC(14,2) DEFAULT 0`);

        // Stock table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stock (
                id         SERIAL PRIMARY KEY,
                item_type  VARCHAR(20) NOT NULL UNIQUE,
                quantity   NUMERIC(14,2) DEFAULT 0,
                meters     NUMERIC(14,2) DEFAULT 0,
                weight     NUMERIC(14,2) DEFAULT 0,
                bags       NUMERIC(14,2) DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`INSERT INTO stock (item_type) VALUES ('drip')  ON CONFLICT (item_type) DO NOTHING`);
        await pool.query(`INSERT INTO stock (item_type) VALUES ('dhana') ON CONFLICT (item_type) DO NOTHING`);

        // Production ledger
        await pool.query(`
            CREATE TABLE IF NOT EXISTS production (
                id         SERIAL PRIMARY KEY,
                item_type  VARCHAR(20) NOT NULL,
                worker     VARCHAR(100),
                shift      VARCHAR(10)  NOT NULL DEFAULT 'day',
                date       DATE         NOT NULL DEFAULT CURRENT_DATE,
                quantity   NUMERIC(14,2) DEFAULT 0,
                meters     NUMERIC(14,2) DEFAULT 0,
                weight     NUMERIC(14,2) DEFAULT 0,
                bags       NUMERIC(14,2) DEFAULT 0,
                notes      TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        console.log("DB initialised successfully");
    } catch (err) {
        console.error("DB init error:", err.message);
    }
}

module.exports = initDB;
