const express = require("express");
const cors = require("cors");
require("dotenv").config();

const initDB = require("./db/init");
const authMiddleware = require("./middleware/auth");

const authRoutes        = require("./routes/auth");
const customerRoutes    = require("./routes/customers");
const transactionRoutes = require("./routes/transactions");
const stockRoutes       = require("./routes/stock");
const productionRoutes  = require("./routes/production");
const userRoutes        = require("./routes/users");
const accountRoutes     = require("./routes/accounts");
const exportRoutes      = require("./routes/export");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Public route
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/customers",    authMiddleware, customerRoutes);
app.use("/api/transactions", authMiddleware, transactionRoutes);
app.use("/api/stock",        authMiddleware, stockRoutes);
app.use("/api/production",   authMiddleware, productionRoutes);
app.use("/api/users",        authMiddleware, userRoutes);
app.use("/api/accounts",     authMiddleware, accountRoutes);
app.use("/api/export",       authMiddleware, exportRoutes);

// Redirect root to login
app.get("/", (_req, res) => res.redirect("/login.html"));

const PORT = process.env.PORT || 5000;

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
