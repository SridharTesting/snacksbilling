// server.js
const express = require('express');
const { Pool } = require('pg');       // PostgreSQL client
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection (Supabase)
const pool = new Pool({
    user: 'your_supabase_user',
    host: 'your_supabase_host',       // e.g., db.xxxxxx.supabase.co
    database: 'your_database_name',
    password: 'your_supabase_password',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

// Test DB connection
pool.connect()
    .then(() => console.log('✅ PostgreSQL Connected'))
    .catch(err => console.error('DB Connection Error:', err));

// ---------------- ADD TRANSACTION ----------------
app.post('/add', async (req, res) => {
    try {
        const { mobile, amount } = req.body;
        const query = `
            INSERT INTO Transactions (mobile, amount, entry_date)
            VALUES ($1, $2, NOW() AT TIME ZONE 'Asia/Kolkata')
        `;
        await pool.query(query, [mobile, amount]);
        res.status(200).send({ status: 'ok' });
    } catch (err) { res.status(500).send(err.message); }
});

// ---------------- MASTER EXPORT ----------------
app.get('/export-all', async (req, res) => {
    try {
        const { period } = req.query;
        let query = "SELECT mobile, amount, entry_date FROM Transactions WHERE 1=1";
        
        if (period === 'today') query += " AND entry_date::date = NOW()::date";
        else if (period === 'weekly') query += " AND entry_date >= NOW() - INTERVAL '7 days'";
        else if (period === 'fortnight') query += " AND entry_date >= NOW() - INTERVAL '14 days'";
        else if (period === 'monthly') query += " AND entry_date >= NOW() - INTERVAL '30 days'";
        
        const result = await pool.query(query + " ORDER BY entry_date DESC");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

// ---------------- SEARCH & STATS ----------------
app.get('/search/:mobile', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { mobile } = req.params;

        let query = "SELECT * FROM Transactions WHERE mobile = $1";
        let params = [mobile];

        if (startDate && endDate) {
            query += " AND entry_date::date BETWEEN $2 AND $3";
            params.push(startDate, endDate);
        }

        query += " ORDER BY entry_date DESC";
        const records = await pool.query(query, params);

        // Stats
        const statsQuery = `
            SELECT
                COALESCE(SUM(amount), 0) AS overall,
                COALESCE(SUM(CASE WHEN entry_date::date = NOW()::date THEN amount ELSE 0 END), 0) AS daily,
                COALESCE(SUM(CASE WHEN entry_date >= NOW() - INTERVAL '7 days' THEN amount ELSE 0 END), 0) AS weekly,
                COALESCE(SUM(CASE WHEN entry_date >= NOW() - INTERVAL '14 days' THEN amount ELSE 0 END), 0) AS fortnight,
                COALESCE(SUM(CASE WHEN entry_date >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END), 0) AS monthly
            FROM Transactions
            WHERE mobile = $1
        `;
        const stats = await pool.query(statsQuery, [mobile]);

        res.json({ transactions: records.rows, stats: stats.rows[0] });
    } catch (err) { res.status(500).send(err.message); }
});

// ---------------- DELETE ----------------
app.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM Transactions WHERE id = $1", [id]);
        res.status(200).send({ status: 'deleted' });
    } catch (err) { res.status(500).send(err.message); }
});

// ---------------- Serve index.html ----------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend is running on port ${PORT}`));
