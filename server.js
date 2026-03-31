// server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL Connection (Supabase) via environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test route to confirm backend is running
app.get('/', (req, res) => {
    res.send("🚀 Backend is running successfully!");
});

// ==========================
// ADD TRANSACTION
// ==========================
app.post('/add', async (req, res) => {
    try {
        const { mobile, amount } = req.body;

        await pool.query(
            "INSERT INTO transactions (mobile, amount) VALUES ($1, $2)",
            [mobile, amount]
        );

        res.status(200).send({ status: 'ok' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ==========================
// MASTER EXPORT
// ==========================
app.get('/export-all', async (req, res) => {
    try {
        const { period } = req.query;

        let query = "SELECT mobile, amount, entry_date FROM transactions WHERE 1=1";

        if (period === 'today')
            query += " AND entry_date::date = CURRENT_DATE";
        else if (period === 'weekly')
            query += " AND entry_date >= NOW() - INTERVAL '7 days'";
        else if (period === 'fortnight')
            query += " AND entry_date >= NOW() - INTERVAL '14 days'";
        else if (period === 'monthly')
            query += " AND entry_date >= NOW() - INTERVAL '30 days'";

        const result = await pool.query(query + " ORDER BY entry_date DESC");

        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ==========================
// SEARCH + STATS
// ==========================
app.get('/search/:mobile', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const mobile = req.params.mobile;

        let query = "SELECT * FROM transactions WHERE mobile = $1";
        let params = [mobile];

        if (startDate && endDate) {
            query += " AND entry_date::date BETWEEN $2 AND $3";
            params.push(startDate, endDate);
        }

        const records = await pool.query(query + " ORDER BY entry_date DESC", params);

        const statsQuery = `
            SELECT 
                COALESCE(SUM(amount), 0) as overall,
                COALESCE(SUM(CASE WHEN entry_date::date = CURRENT_DATE THEN amount ELSE 0 END), 0) as daily,
                COALESCE(SUM(CASE WHEN entry_date >= NOW() - INTERVAL '7 days' THEN amount ELSE 0 END), 0) as weekly,
                COALESCE(SUM(CASE WHEN entry_date >= NOW() - INTERVAL '14 days' THEN amount ELSE 0 END), 0) as fortnight,
                COALESCE(SUM(CASE WHEN entry_date >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END), 0) as monthly
            FROM transactions WHERE mobile = $1
        `;

        const stats = await pool.query(statsQuery, [mobile]);

        res.json({
            transactions: records.rows,
            stats: stats.rows[0]
        });

    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ==========================
// DELETE
// ==========================
app.delete('/delete/:id', async (req, res) => {
    try {
        await pool.query(
            "DELETE FROM transactions WHERE id = $1",
            [req.params.id]
        );

        res.status(200).send({ status: 'deleted' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ==========================
// SERVER LISTEN
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
