const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

let dbInstance = null;

async function getDb() {
    if (!dbInstance) {
        dbInstance = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Initialize tables
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                room TEXT,
                user TEXT,
                message TEXT,
                type TEXT,
                url TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS quiz_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT,
                score_percent INTEGER,
                responses_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ SQLite connected and initialized');
    }
    return dbInstance;
}

// Ensure init
getDb().catch(err => console.error('Database Init Error:', err));

async function testConnection() {
    try {
        const db = await getDb();
        const row = await db.get('SELECT 1 as test');
        console.log('DB test OK:', row.test);
    } catch (err) {
        console.error('DB test failed:', err.message);
    }
}

module.exports = { getDb, testConnection };
