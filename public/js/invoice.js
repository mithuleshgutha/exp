/* Invoice generator — builds the POLY (Bill of Supply) and IRRIGATION (GST Invoice)
   layouts from POLYMERS-2.xlsx as a PDF, entirely in the browser. */

const SELLERS = {
    poly: {
        title: "BILL OF SUPPLY",
        name: "M/S. LAKSHMI VENKATESWARA POLYMERS",
        address: "S. NO. 192/5, 194/2, PLOT NO. 26, NEAR RAZAK FUNCTION HALL, ANANTAPUR, A.P. - 515 001.",
        gstin: "37AAFFL7819K1ZT",
        itemLabel: "DESCRIPTION OF GOODS",
        defaultItem: "16MM INLINE DRIP",
        defaultRate: "2.8",
        taxed: false,
    },
    irri: {
        title: "GST TAX INVOICE / CASH / CREDIT MEMO",
        name: "M/S. LAKSHMI VENKATESWARA IRRIGATION SYSTEMS",
        address: "S. NO. 192/5, 194/2, PLOT NO. 28, KALYANDURG ROAD, ANANTAPUR, A.P. - 515 001.",
        gstin: "37ALTPN0334J1ZR",
        itemLabel: "GOODS",
        defaultItem: "DRIP IRRIGATION",
        defaultRate: "",
        taxed: true,
    },
};

/* ---------- helpers ---------- */
const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN",
    "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function below100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""); }
function below1000(n) {
    const h = Math.floor(n / 100), r = n % 100;
    return [h ? ONES[h] + " HUNDRED" : "", r ? (h ? "AND " : "") + below100(r) : ""].filter(Boolean).join(" ");
}
/* Indian numbering: crore / lakh / thousand */
function rupeesInWords(amount) {
    let rupees = Math.floor(Math.round(amount * 100) / 100);
    const paise = Math.round((amount - rupees) * 100);
    if (rupees === 0 && paise === 0) return "ZERO RUPEES ONLY";
    const parts = [];
    const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
    const lakh = Math.floor(rupees / 100000);    rupees %= 100000;
    const thou = Math.floor(rupees / 1000);      rupees %= 1000;
    if (crore) parts.push(below100(crore) + " CRORE");
    if (lakh)  parts.push(below100(lakh) + " LAKH");
    if (thou)  parts.push(below100(thou) + " THOUSAND");
    if (rupees) parts.push(below1000(rupees));
    let words = parts.join(" ") + " RUPEES";
    if (paise) words += " AND " + below100(paise) + " PAISE";
    return words + " ONLY";
}

const n2 = v => (Number(v) || 0).toFixed(2);
const inr = v => (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = iso => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}-${m}-${y}`; };

/* ---------- calculation (pure) ---------- */
function computeInvoice(inv) {
    const cfg = SELLERS[inv.type];
    // IRRIGATION: GST rates come from the form (defaults CGST 0, SGST 0, IGST 5)
    const pct = v => (v === undefined || v === "" || isNaN(Number(v))) ? null : Number(v);
    const rates = cfg.taxed
        ? { cgst: pct(inv.cgstRate) ?? 0, sgst: pct(inv.sgstRate) ?? 0, igst: pct(inv.igstRate) ?? 5 }
        : { cgst: 0, sgst: 0, igst: 0 };
    const rows = inv.items.map(it => {
        const total = (Number(it.qty) || 0) * (Number(it.rate) || 0);
        const discount = Number(it.discount) || 0;
        const taxable = total - discount;
        let cgst = 0, sgst = 0, igst = 0;
        if (cfg.taxed) {
            cgst = taxable * rates.cgst / 100;
            sgst = taxable * rates.sgst / 100;
            igst = taxable * rates.igst / 100;
        }
        return { ...it, total, discount, taxable, cgst, sgst, igst, rowTotal: taxable + cgst + sgst + igst };
    });
    const charges = [
        ["Freight", Number(inv.freight) || 0],
        ["Insurance", Number(inv.insurance) || 0],
        ["Packing and Forwarding Charges", Number(inv.packing) || 0],
    ];
    const sum = k => rows.reduce((s, r) => s + r[k], 0);
    const chargeSum = charges.reduce((s, c) => s + c[1], 0);
    const t = {
        taxable: sum("taxable") + chargeSum,
        cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"),
    };
    t.tax = t.cgst + t.sgst + t.igst;
    t.grand = Math.round((t.taxable + t.tax) * 100) / 100;
    return { cfg, rates, rows, charges, totals: t };
}

/* ---------- POLY (Bill of Supply) — mirrors the printed Excel sheet ---------- */
function buildPolyPdf(inv) {
    const { jsPDF } = window.jspdf || require("jspdf");
    const { cfg, rows, charges, totals } = computeInvoice(inv);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const X = 5.3, W = 199, R = X + W;          // outer box
    const TOP = 23;
    const colW = [21.6, 46, 34, 25.5, 19.5, 23.4, 28.7];
    const colX = colW.reduce((a, w) => (a.push(a[a.length - 1] + w), a), [X]);   // 8 edges
    const money = v => (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const figure = Number.isInteger(totals.grand) ? totals.grand.toLocaleString("en-IN") : money(totals.grand);
    const T = (txt, x, y, o = {}) => { doc.setFont("times", "bold"); doc.setFontSize(o.size || 9); doc.text(String(txt), x, y, { align: o.align || "left", maxWidth: o.max }); };
    const H = (txt, x, y, size) => { doc.setFont("helvetica", "bold"); doc.setFontSize(size); doc.text(txt, x, y, { align: "center" }); };
    const hline = (y, x1 = X, x2 = R) => doc.line(x1, y, x2, y);
    const vline = (x, y1, y2) => doc.line(x, y1, x, y2);

    doc.setLineWidth(0.5);
    let y = TOP;
    // Title block
    H(cfg.title, X + W / 2, y + 6, 14);                         hline(y + 9);
    H(cfg.name, X + W / 2, y + 16.3, 20);                       hline(y + 19);
    doc.setFontSize(9.5); H(cfg.address, X + W / 2, y + 23.5, 9.5);   hline(y + 24.5);
    T("GSTIN: " + cfg.gstin, X + 0.8, y + 29.2, { size: 9.5 }); hline(y + 30);
    y += 30;

    // Bill to / place of supply / invoice no. / dated
    const lx = X + 0.8, mx = 73.9, ix = 152.9, dx = 176;
    T("BILL TO", lx, y + 6.8);  T("PLACE OF SUPPLY", mx, y + 6.8);
    T("INVOICE NO.", ix, y + 6.8); T("DATED", dx, y + 6.8);
    const left = [inv.bName, ...doc.splitTextToSize(inv.bAddr || "", 62)].filter(Boolean);
    left.forEach((l, i) => { T(l.toUpperCase(), lx, y + 18 + i * 5.5, { max: 66 }); T(l.toUpperCase(), mx, y + 18 + i * 5.5, { max: 66 }); });
    const stY = y + 18 + left.length * 5.5;
    T("STATE: " + (inv.bState || "").toUpperCase(), lx, stY);  T("STATE: " + (inv.bState || "").toUpperCase(), mx, stY);
    T(inv.invNo, ix + 18, y + 18, { align: "right" });   T(fmtDate(inv.invDate), dx + 1, y + 18);
    T("VEHICLE NO.", ix, y + 29);                         T((inv.vehicle || "").toUpperCase(), dx, y + 29);
    y = Math.max(y + 38.6, stY + 3);
    hline(y);

    // Table header
    const hh = 14.5;
    const heads = ["SL.\nNO.", cfg.itemLabel, "HSN\nCODE\n[GST]", "QTY", "UOM", "RATE\n[Rs.]", "TOTAL\n[Rs.]"];
    heads.forEach((h, i) => {
        const cx = (colX[i] + colX[i + 1]) / 2, lines = h.split("\n");
        lines.forEach((l, k) => T(l, cx, y + hh - 2.5 - (lines.length - 1 - k) * 3.8, { align: "center", size: 8.5 }));
    });
    const tableTop = y;
    y += hh; hline(y);

    // Item rows (padded to at least 3)
    const rowH = 11;
    const nRows = Math.max(3, rows.length);
    for (let i = 0; i < nRows; i++) {
        const r = rows[i];
        if (r) {
            const by = y + rowH - 3.5;
            T(i + 1, (colX[0] + colX[1]) / 2, by, { align: "center" });
            T((r.desc || "").toUpperCase(), (colX[1] + colX[2]) / 2, by, { align: "center", max: colW[1] - 2 });
            T(r.hsn, (colX[2] + colX[3]) / 2, by, { align: "center" });
            T(Number(r.qty).toLocaleString("en-IN"), (colX[3] + colX[4]) / 2, by, { align: "center" });
            T((r.uom || "").toUpperCase(), (colX[4] + colX[5]) / 2, by, { align: "center" });
            T(money(r.rate), (colX[5] + colX[6]) / 2, by, { align: "center" });
            T(money(r.taxable), R - 1.5, by, { align: "right" });
        }
        y += rowH;
        if (i === nRows - 1) hline(y);
    }

    // Charges
    charges.forEach(([label, amt], i) => {
        const ch = 7.5;
        T(label, X + 1, y + ch - 2.2, { size: 9.5 });
        if (amt) T(money(amt), R - 1.5, y + ch - 2.2, { align: "right" });
        y += ch; hline(y, X, R);
    });
    // Total row
    const th = 8;
    T("TOTAL", (colX[4] + colX[6]) / 2, y + th - 2, { align: "center", size: 11 });
    T(money(totals.grand), R - 1.5, y + th - 2, { align: "right" });
    vline(colX[4], y, y + th);
    y += th; hline(y);
    // Column dividers across header + item + charge rows (not through the total-row label area)
    for (let i = 1; i < 7; i++) vline(colX[i], tableTop, y - th - charges.length * 7.5 - 0.0);
    vline(colX[6], tableTop, y);

    // Figure / words
    T(`TOTAL INVOICE VALUE - [IN FIGURE]  ${figure}/-`, X + 0.8, y + 11, { size: 9 });
    T(`TOTAL INVOICE VALUE [IN WORDS] RUPEES:  ${rupeesInWords(totals.grand)}.`, X + 0.8, y + 24, { size: 9, max: W - 2 });
    y += 28; hline(y);

    // Signature
    T("For " + cfg.name.replace("M/S. ", "M/s. "), 140, y + 13, { align: "center", size: 10.5 });
    T("Authorized Signatory", 140, y + 33, { align: "center", size: 10.5 });
    y += 43;

    // Outer box
    doc.rect(X, TOP, W, y - TOP);
    return doc;
}

/* ---------- IRRIGATION (GST Invoice) — mirrors the printed Excel sheet ----------
   Layout coordinates are taken from the reference PDF (990 x 1400 px page) and scaled to mm. */
function buildIrriPdf(inv) {
    const { jsPDF } = window.jspdf || require("jspdf");
    const { cfg, rows, charges, totals, rates } = computeInvoice(inv);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const k = 210 / 990;                                   // px -> mm
    const P = v => v * k;
    const X0 = 25, X1 = 953;                               // outer box (px)
    const cx = [25, 62, 128, 182, 237, 288, 354, 417, 454, 524, 575, 648, 692, 761, 811, 870, 953];
    const num = v => Number.isInteger(+v) ? String(+v) : (+v).toFixed(2);
    const txt = (t, x, y, o = {}) => { doc.setFont(o.font || "times", o.style || "normal"); doc.setFontSize(o.size || 8); doc.text(String(t), P(x), P(y), { align: o.align || "left", baseline: "middle", maxWidth: o.max ? P(o.max) : undefined }); };
    const hl = (y, x1 = X0, x2 = X1) => doc.line(P(x1), P(y), P(x2), P(y));
    const vl = (x, y1, y2) => doc.line(P(x), P(y1), P(x), P(y2));
    const mid = (i, j) => (cx[i] + cx[j]) / 2;

    doc.setLineWidth(0.45);
    const TOP = 27;
    // Title block
    txt(cfg.title, 489, 49, { font: "helvetica", style: "bold", size: 13, align: "center" });  hl(67);
    txt(cfg.name, 489, 90, { font: "helvetica", style: "bold", size: 19, align: "center" });   hl(114);
    txt(cfg.address, 489, 130, { font: "helvetica", style: "bold", size: 9.5, align: "center" }); hl(143);

    doc.setLineWidth(0.2);
    const lab = (t, x, y) => txt(t, x, y, { size: 8 });
    const info = [
        [188, "GSTIN NUMBER", cfg.gstin, "TRANSPORTATION MODE", inv.mode || ""],
        [220, "INVOICE SERIAL NO.", inv.invNo, "VEHICLE NUMBER", (inv.vehicle || "").toUpperCase()],
        [252, "INVOICE DATE", fmtDate(inv.invDate), "DATE & TIME OF SUPPLY", fmtDate(inv.invDate)],
        [284, "", "", "PLACE OF SUPPLY", (inv.placeSupply || "").toUpperCase()],
    ];
    info.forEach(([y, l1, v1, l2, v2]) => {
        if (l1) { lab(l1, 28, y); lab(":", 200, y); txt(v1, 355, y, { align: "center" }); }
        lab(l2, 578, y); lab(":", 772, y); txt(v2, 880, y, { align: "center" });
    });
    doc.setLineWidth(0.45); hl(295); doc.setLineWidth(0.2); hl(318);

    // Receiver / consignee
    const name = "NAME : " + (inv.bName || "").toUpperCase() + (inv.bAadhar ? " AADHAR: " + inv.bAadhar : "");
    const rec = [
        ["DETAILS OF RECEIVER [BILLED TO]", "DETAILS OF CONSIGNEE [SHIPPED TO]", 334, 350],
        [name, name, 373, 396],
        ["ADDRESS:  " + (inv.bAddr || "").toUpperCase(), "ADDRESS:  " + (inv.bAddr || "").toUpperCase(), 412, 428],
        ["STATE: " + (inv.bState || "").toUpperCase(), "STATE: " + (inv.bState || "").toUpperCase(), 444, 460],
        ["STATE CODE: " + (inv.bCode || ""), "STATE CODE: " + (inv.bCode || ""), 476, 492],
    ];
    rec.forEach(([l, r, ty, ly]) => {
        txt(l, 28, ty, { max: 420 }); txt(r, 527, ty, { max: 420 });
        hl(ly, X0, 454); hl(ly, 524, X1);
    });
    vl(454, 318, 524); vl(524, 318, 524);
    hl(524);

    // Table header
    const H0 = 524, H1 = 617, G = 548;
    hl(H1);
    const hd = (t, i, j, y) => t.split("\n").forEach((ln, n, arr) => txt(ln, mid(i, j), y - (arr.length - 1 - n) * 11, { align: "center", size: 7.5 }));
    hd("SL.\nNO.", 0, 1, 606);  hd("GOODS", 1, 2, 606);       hd("HSN\nCODE\n[GST]", 2, 3, 606);
    hd("QTY", 3, 4, 606);      hd("UOM", 4, 5, 606);         hd("RATE\n[Rs.]", 5, 6, 606);
    hd("TOTAL\n[Rs.]", 6, 7, 606); hd("DIS-\nCOU\nNT", 7, 8, 606);
    hd("TAXABLE\n\nVALUE\n[Rs.]", 8, 9, 606);
    hd("CGST", 9, 11, 537); hd("SGST", 11, 13, 537); hd("IGST", 13, 15, 537);
    hd("TOTAL\n[Rs.]", 15, 16, 606);
    [["RATE\n%", 9, 10], ["AMOUNT\n[Rs.]", 10, 11], ["RATE\n%", 11, 12], ["AMOUNT\n[Rs.]", 12, 13], ["RATE\n%", 13, 14], ["AMOUNT\n[Rs.]", 14, 15]]
        .forEach(([t, i, j]) => hd(t, i, j, 606));
    hl(G, cx[9], cx[15]);

    // Item rows
    let y = H1;
    const items = rows.length ? rows : [];
    items.forEach((r) => {
        const descLines = doc.setFont("times", "normal").setFontSize(7.5).splitTextToSize((r.desc || "").toUpperCase(), P(cx[2] - cx[1] - 6));
        const h = Math.max(70, descLines.length * 15 + 10);
        const by = y + h - 18;
        txt(items.indexOf(r) + 1, mid(0, 1), by, { align: "center" });
        descLines.forEach((ln, n) => txt(ln, mid(1, 2), by - (descLines.length - 1 - n) * 14, { align: "center", size: 7.5 }));
        txt(r.hsn, mid(2, 3), by, { align: "center" });
        txt(r.qty, 233, by, { align: "right" });
        txt((r.uom || "").toUpperCase(), cx[4] + 2, by);
        txt((+r.rate).toFixed(2), mid(5, 6), by, { align: "center" });
        txt(num(r.total), cx[7] - 4, by, { align: "right" });
        if (r.discount) txt(num(r.discount), cx[8] - 4, by, { align: "right" });
        txt(num(r.taxable), cx[9] - 4, by, { align: "right" });
        if (rates.cgst) { txt(rates.cgst, mid(9, 10), by, { align: "center" }); txt(num(r.cgst), cx[11] - 4, by, { align: "right" }); }
        if (rates.sgst) { txt(rates.sgst, mid(11, 12), by, { align: "center" }); txt(num(r.sgst), cx[13] - 4, by, { align: "right" }); }
        if (rates.igst) { txt(rates.igst, mid(13, 14), by, { align: "center" }); txt(num(r.igst), cx[15] - 4, by, { align: "right" }); }
        txt(num(r.rowTotal), cx[16] - 4, by, { align: "right" });
        y += h; hl(y);
    });
    const itemsEnd = y;
    y += 32; hl(y);                                           // blank row

    // Charges
    const chTop = y;
    charges.forEach(([label, amt]) => {
        txt(label, 28, y + 16, { size: 10 });
        if (amt) { txt(num(amt), cx[9] - 4, y + 16, { align: "right", size: 8 }); txt(num(amt), cx[16] - 4, y + 16, { align: "right", size: 8 }); }
        y += 32; hl(y);
    });
    // Total row
    const totTop = y;
    txt("Total", mid(4, 7), y + 16, { align: "center", style: "bold", size: 10.5 });
    txt(num(totals.taxable), cx[9] - 4, y + 16, { align: "right", style: "bold" });
    txt(num(totals.cgst), cx[11] - 4, y + 16, { align: "right", style: "bold" });
    txt(num(totals.sgst), cx[13] - 4, y + 16, { align: "right", style: "bold" });
    txt(num(totals.igst), cx[15] - 4, y + 16, { align: "right", style: "bold" });
    txt(num(totals.grand), cx[16] - 4, y + 16, { align: "right", style: "bold" });
    y += 32; hl(y);

    // Column dividers
    for (let i = 1; i < 16; i++) {
        vl(cx[i], i >= 9 && i % 2 === 0 ? G : H0, itemsEnd + 32);                                  // table body
        if (i === 7 || i === 8) vl(cx[i], chTop, y);
        if (i >= 9) vl(cx[i], chTop, y);
        if (i === 4) vl(cx[i], totTop, y);
    }
    vl(cx[9], H0, y);  vl(cx[15], H0, y);  vl(cx[16], H0, y);
    // rate/amount dividers inside group headers
    [10, 12, 14].forEach(i => vl(cx[i], G, itemsEnd + 32));

    // Figure / words
    y += 38; hl(y);
    const wy = y + 58;
    txt(`TOTAL INVOICE VALUE - [IN FIGURE] Rs.${totals.grand.toLocaleString("en-IN")}/-`, 28, wy, { size: 8 });
    const words = doc.setFont("times", "normal").setFontSize(8).splitTextToSize(`TOTAL INVOICE VALUE [IN WORDS]  RUPEES:  ${rupeesInWords(totals.grand)}`, P(520));
    words.forEach((ln, n) => txt(ln, 28, wy + 34 + n * 17, { size: 8 }));
    y += 148; hl(y);

    // Signature
    txt("For M/s." + cfg.name.replace("M/S. ", ""), 685, y + 62, { align: "center", style: "bold", size: 9 });
    txt("Authorized Signatory", 704, y + 158, { align: "center", style: "bold", size: 9 });
    y += 195;

    doc.setLineWidth(0.45);
    doc.rect(P(X0), P(TOP), P(X1 - X0), P(y - TOP));
    return doc;
}

/* ---------- PDF ---------- */
function buildPdf(inv) {
    return inv.type === "poly" ? buildPolyPdf(inv) : buildIrriPdf(inv);
}

/* ---------- UI (browser only) ---------- */
let curType = "poly";

function readInvoice() {
    const v = id => document.getElementById(id).value;
    const items = [...document.querySelectorAll(".item-row")].map(r => ({
        desc: r.querySelector(".i-desc").value, hsn: r.querySelector(".i-hsn").value,
        qty: r.querySelector(".i-qty").value, uom: r.querySelector(".i-uom").value,
        rate: r.querySelector(".i-rate").value, discount: r.querySelector(".i-disc").value,
    }));
    return {
        type: curType, invNo: v("invNo"), invDate: v("invDate"), vehicle: v("vehicle"), mode: v("mode"),
        placeSupply: v("placeSupply"), bName: v("bName"), bAadhar: v("bAadhar"), bAddr: v("bAddr"),
        bState: v("bState"), bCode: v("bCode"), items, freight: v("freight"), insurance: v("insurance"),
        packing: v("packing"), cgstRate: v("cgstRate"), sgstRate: v("sgstRate"), igstRate: v("igstRate"),
    };
}

function addItem() {
    const d = document.createElement("div");
    d.className = "item-row";
    d.innerHTML = `
        <div class="row g-2">
            <div class="col-12"><label class="form-label small fw-semibold mb-1">Description</label>
                <input class="form-control i-desc" value="${SELLERS[curType].defaultItem}" oninput="calc()"></div>
            <div class="col-4"><label class="form-label small mb-1">HSN</label><input class="form-control i-hsn" value="8424"></div>
            <div class="col-4"><label class="form-label small mb-1">Qty</label><input type="number" inputmode="decimal" min="0" class="form-control i-qty" oninput="calc()"></div>
            <div class="col-4"><label class="form-label small mb-1">UOM</label><input class="form-control i-uom" value="MTRS"></div>
            <div class="col-5"><label class="form-label small mb-1">Rate (₹)</label><input type="number" inputmode="decimal" min="0" step="any" class="form-control i-rate" value="${SELLERS[curType].defaultRate}" oninput="calc()"></div>
            <div class="col-5"><label class="form-label small mb-1">Discount (₹)</label><input type="number" inputmode="decimal" min="0" class="form-control i-disc" oninput="calc()"></div>
            <div class="col-2 d-flex align-items-end"><button class="btn btn-outline-danger w-100" onclick="this.closest('.item-row').remove();calc()"><i class="bi bi-trash"></i></button></div>
        </div>`;
    document.getElementById("items").appendChild(d);
    calc();
}

function setType(t) {
    curType = t;
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.toggle("active", b.dataset.type === t));
    document.querySelectorAll(".irri-only").forEach(e => e.style.display = t === "irri" ? "" : "none");
    const prev = SELLERS[t === "poly" ? "irri" : "poly"].defaultItem;
    document.querySelectorAll(".i-desc").forEach(i => { if (i.value === prev) i.value = SELLERS[t].defaultItem; });
    const prevRate = SELLERS[t === "poly" ? "irri" : "poly"].defaultRate;
    document.querySelectorAll(".i-rate").forEach(i => { if (i.value === prevRate) i.value = SELLERS[t].defaultRate; });
    calc();
}

function calc() {
    const { totals } = computeInvoice(readInvoice());
    document.getElementById("sTaxable").textContent = inr(totals.taxable);
    document.getElementById("sCgst").textContent = inr(totals.cgst);
    document.getElementById("sSgst").textContent = inr(totals.sgst);
    document.getElementById("sIgst").textContent = inr(totals.igst);
    document.getElementById("sTax").textContent = inr(totals.tax);
    document.getElementById("sTotal").textContent = "₹" + inr(totals.grand);
    document.getElementById("sWords").textContent = totals.grand ? rupeesInWords(totals.grand) : "";
}

function generate() {
    const inv = readInvoice();
    if (!inv.bName.trim()) return alert("Enter the buyer name.");
    if (!inv.items.length || !inv.items.some(i => Number(i.qty) > 0 && Number(i.rate) > 0))
        return alert("Add at least one item with quantity and rate.");
    const doc = buildPdf(inv);
    const fname = `${inv.type === "poly" ? "Bill-of-Supply" : "Invoice"}-${(inv.invNo || "draft").replace(/[^\w-]/g, "_")}.pdf`;
    // iOS Safari ignores download names: open the PDF so it can be shared / saved from the viewer
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) window.open(doc.output("bloburl"), "_blank");
    else doc.save(fname);
}

if (typeof document !== "undefined" && document.getElementById("items")) {
    document.getElementById("backBtn").href = localStorage.getItem("token") ? "/dashboard.html" : "/login.html";
    document.getElementById("invDate").value = new Date().toISOString().slice(0, 10);
    addItem();
    setType("poly");
}

if (typeof module !== "undefined") module.exports = { computeInvoice, buildPdf, buildPolyPdf, buildIrriPdf, rupeesInWords, SELLERS };
