const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const config = {
    user: 'admin',
    password: 'admin',
    server: '127.0.0.1', 
    database: 'MiraclesDB',
    port: 1433, 
    options: { encrypt: false, trustServerCertificate: true, connectTimeout: 30000 }
};

sql.connect(config).then(() => console.log("✅ MSSQL Connected")).catch(err => console.log(err));

// ADD TRANSACTION
app.post('/add', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        await pool.request()
            .input('mobile', sql.NVarChar, req.body.mobile)
            .input('amount', sql.Decimal(18, 2), req.body.amount)
            .query("INSERT INTO Transactions (mobile, amount, entry_date) VALUES (@mobile, @amount, SWITCHOFFSET(SYSDATETIMEOFFSET(), '+05:30'))");
        res.status(200).send({ status: 'ok' });
    } catch (err) { res.status(500).send(err.message); }
});

// MASTER EXPORT (All Users)
app.get('/export-all', async (req, res) => {
    try {
        const { period } = req.query;
        let pool = await sql.connect(config);
        let query = "SELECT mobile, amount, entry_date FROM Transactions WHERE 1=1";
        
        if (period === 'today') query += " AND CAST(SWITCHOFFSET(entry_date, '+05:30') AS DATE) = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+05:30') AS DATE)";
        else if (period === 'weekly') query += " AND entry_date >= DATEADD(day, -7, SYSDATETIMEOFFSET())";
        else if (period === 'fortnight') query += " AND entry_date >= DATEADD(day, -14, SYSDATETIMEOFFSET())";
        else if (period === 'monthly') query += " AND entry_date >= DATEADD(day, -30, SYSDATETIMEOFFSET())";
        
        const result = await pool.request().query(query + " ORDER BY entry_date DESC");
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

// SEARCH & USER STATS
app.get('/search/:mobile', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let pool = await sql.connect(config);
        let request = pool.request().input('mobile', sql.NVarChar, req.params.mobile);
        
        let queryStr = "SELECT * FROM Transactions WHERE mobile = @mobile";
        
        // Apply Date Filtering if provided
        if (startDate && endDate) {
            queryStr += " AND CAST(SWITCHOFFSET(entry_date, '+05:30') AS DATE) BETWEEN @start AND @end";
            request.input('start', sql.Date, startDate);
            request.input('end', sql.Date, endDate);
        }
        
        const records = await request.query(queryStr + " ORDER BY entry_date DESC");

        // Calculate Stats (Always reflects lifetime windows for the quick-glance boxes)
        let statsQuery = `
            SELECT 
                ISNULL(SUM(amount), 0) as overall,
                ISNULL(SUM(CASE WHEN CAST(SWITCHOFFSET(entry_date, '+05:30') AS DATE) = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+05:30') AS DATE) THEN amount ELSE 0 END), 0) as daily,
                ISNULL(SUM(CASE WHEN entry_date >= DATEADD(day, -7, SYSDATETIMEOFFSET()) THEN amount ELSE 0 END), 0) as weekly,
                ISNULL(SUM(CASE WHEN entry_date >= DATEADD(day, -14, SYSDATETIMEOFFSET()) THEN amount ELSE 0 END), 0) as fortnight,
                ISNULL(SUM(CASE WHEN entry_date >= DATEADD(day, -30, SYSDATETIMEOFFSET()) THEN amount ELSE 0 END), 0) as monthly
            FROM Transactions WHERE mobile = @mobile
        `;
        const stats = await pool.request().input('mobile', sql.NVarChar, req.params.mobile).query(statsQuery);
        
        res.json({ transactions: records.recordset, stats: stats.recordset[0] });
    } catch (err) { res.status(500).send(err.message); }
});

// DELETE
app.delete('/delete/:id', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Transactions WHERE id = @id');
        res.status(200).send({ status: 'deleted' });
    } catch (err) { res.status(500).send(err.message); }
});

app.listen(3000, () => console.log('✅ Bridge Live at http://localhost:3000'));
