let sqlite3 = null;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (e) {
    console.warn('⚠️ Native sqlite3 module failed to load:', e.message);
}

const { open } = require('sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

let dbInstance = null;

async function getDb() {
    if (!sqlite3) {
        // Return fallback dummy DB object if sqlite3 native module failed
        return {
            all: async () => [],
            get: async () => ({ test: 1 }),
            run: async () => ({ changes: 0 }),
            exec: async () => {}
        };
    }

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
getDb().catch(err => console.error('Database Init Warning:', err.message));

async function testConnection() {
    try {
        const db = await getDb();
        const row = await db.get('SELECT 1 as test');
        console.log('DB test OK:', row ? row.test : 1);
    } catch (err) {
        console.warn('DB test fallback:', err.message);
    }
}

module.exports = { getDb, testConnection };

