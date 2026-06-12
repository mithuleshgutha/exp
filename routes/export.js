const express  = require("express");
const router   = express.Router();
const pool     = require("../db/db");
const ExcelJS  = require("exceljs");

const COLS = [
    { header: "Date",          key: "date",             width: 14 },
    { header: "Type",          key: "transaction_type", width: 14 },
    { header: "Customer/Party",key: "customer_name",    width: 22 },
    { header: "Account",       key: "account_name",     width: 16 },
    { header: "Product",       key: "product",          width: 14 },
    { header: "Quantity",      key: "quantity",         width: 10 },
    { header: "Rate",          key: "rate",             width: 10 },
    { header: "Total",         key: "total",            width: 12 },
    { header: "Paid Amount",   key: "paid_amount",      width: 13 },
    { header: "Pending",       key: "pending_amount",   width: 12 },
    { header: "Notes",         key: "notes",            width: 28 },
];

const HEADER_FILL = {
    type: "pattern", pattern: "solid", fgColor: { argb: "FFD5C4B0" }
};

function addSheet(wb, name, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = COLS;

    // Header row styling
    const hRow = ws.getRow(1);
    hRow.font = { bold: true };
    hRow.fill = HEADER_FILL;
    hRow.alignment = { vertical: "middle" };
    hRow.height = 18;

    rows.forEach(r => {
        ws.addRow({
            date:             r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "",
            transaction_type: r.transaction_type,
            customer_name:    r.customer_name || "",
            account_name:     r.account_name  || "",
            product:          r.product       || "",
            quantity:         parseFloat(r.quantity)       || "",
            rate:             parseFloat(r.rate)           || "",
            total:            parseFloat(r.total)          || "",
            paid_amount:      parseFloat(r.paid_amount)    || "",
            pending_amount:   parseFloat(r.pending_amount) || "",
            notes:            r.notes || "",
        });
    });

    // Zebra stripe
    ws.eachRow((row, i) => {
        if (i === 1) return;
        if (i % 2 === 0) {
            row.eachCell(cell => {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F5F2" } };
            });
        }
    });

    // Border on header
    hRow.eachCell(cell => {
        cell.border = { bottom: { style: "thin", color: { argb: "FF8B5E3C" } } };
    });

    return ws;
}

router.get("/transactions", async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, COALESCE(c.name, '') AS customer_name, a.name AS account_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN accounts  a ON t.account_id  = a.id
            WHERE t.deleted_at IS NULL
            ORDER BY DATE(t.created_at) DESC, COALESCE(t.updated_at, t.created_at) DESC
        `);

        const all      = result.rows;
        const inwards  = all.filter(r => ["SALE", "PAYMENT_IN"].includes(r.transaction_type));
        const outwards = all.filter(r => ["PAYMENT_OUT", "EXPENSE", "PURCHASE"].includes(r.transaction_type));

        const wb = new ExcelJS.Workbook();
        wb.creator = "OpTrack";
        wb.created = new Date();

        addSheet(wb, "All Transactions", all);
        addSheet(wb, "Inwards",          inwards);
        addSheet(wb, "Outwards",         outwards);

        const date = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type",        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="transactions-${date}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
