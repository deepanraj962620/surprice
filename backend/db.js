const fs = require('fs');
const path = require('path');

const dbFilePath = path.resolve(__dirname, 'database.json');

// Initialize database store
let store = {
    messages: [],
    quiz_responses: []
};

function loadStore() {
    try {
        if (fs.existsSync(dbFilePath)) {
            const raw = fs.readFileSync(dbFilePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.messages)) store.messages = data.messages;
            if (Array.isArray(data.quiz_responses)) store.quiz_responses = data.quiz_responses;
        }
    } catch (e) {
        console.warn('⚠️ Error reading database.json:', e.message);
    }
}

function saveStore() {
    try {
        fs.writeFileSync(dbFilePath, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
        console.warn('⚠️ Error writing database.json:', e.message);
    }
}

loadStore();

async function getDb() {
    return {
        all: async (sql, params = []) => {
            loadStore();
            const s = sql.toLowerCase();
            
            if (s.includes('quiz_responses')) {
                return [...store.quiz_responses].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            }

            if (s.includes('messages')) {
                let list = [...store.messages];
                if (s.includes('where room = ?') && params[0]) {
                    list = list.filter(m => m.room === params[0]);
                } else if (s.includes('where user = ?') && params[0]) {
                    list = list.filter(m => m.user === params[0]);
                }
                list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
                const limit = params.find(p => typeof p === 'number') || 100;
                return list.slice(0, limit);
            }

            return [];
        },

        get: async (sql, params = []) => {
            if (sql.toLowerCase().includes('select 1')) {
                return { test: 1 };
            }
            const rows = await (await getDb()).all(sql, params);
            return rows[0] || null;
        },

        run: async (sql, params = []) => {
            loadStore();
            const s = sql.toLowerCase();

            if (s.includes('insert into quiz_responses')) {
                const record = {
                    id: store.quiz_responses.length + 1,
                    email: params[0] || 'Anonymous',
                    score_percent: params[1] || 0,
                    responses_json: params[2] || '[]',
                    created_at: new Date().toISOString()
                };
                store.quiz_responses.push(record);
                saveStore();
                return { changes: 1, id: record.id };
            }

            if (s.includes('insert into messages')) {
                const [id, room, user, message, type = 'text', url = ''] = params;
                const existingIdx = store.messages.findIndex(m => m.id === id);
                const msgObj = {
                    id,
                    room,
                    user,
                    message,
                    type,
                    url,
                    timestamp: new Date().toISOString()
                };
                if (existingIdx >= 0) {
                    store.messages[existingIdx] = msgObj;
                } else {
                    store.messages.push(msgObj);
                }
                saveStore();
                return { changes: 1 };
            }

            if (s.includes('delete from messages where room = ?')) {
                const initialLen = store.messages.length;
                store.messages = store.messages.filter(m => m.room !== params[0]);
                saveStore();
                return { changes: initialLen - store.messages.length };
            }

            if (s.includes('delete from messages where id = ?') || s.includes('delete from messages where id=?')) {
                const initialLen = store.messages.length;
                const targetId = params[0];
                store.messages = store.messages.filter(m => m.id !== targetId);
                saveStore();
                return { changes: initialLen - store.messages.length };
            }

            return { changes: 0 };
        },

        exec: async () => {}
    };
}

async function testConnection() {
    console.log('✅ JS Database engine initialized');
}

module.exports = { getDb, testConnection };


