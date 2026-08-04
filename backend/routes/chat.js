const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db');


// GET /api/chat/messages - Legacy endpoint
router.get('/messages', async (req, res) => {
  try {
    const { limit = 100, offset = 0, user } = req.query;
    let query = 'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    let params = [parseInt(limit), parseInt(offset)];

    if (user) {
      query = 'SELECT * FROM messages WHERE user = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params = [user, parseInt(limit), parseInt(offset)];
    }

    const db = await getDb();
    const rows = await db.all(query, params);
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error('Chat GET error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/chat/room/:password/messages - Room-specific history
router.get('/room/:password/messages', async (req, res) => {
  try {
    const room = 'chat_' + crypto.createHash('sha256').update(req.params.password).digest('hex').slice(0, 16);
    const { limit = 100, offset = 0 } = req.query;
    
    const db = await getDb();
    const rows = await db.all(
      'SELECT * FROM messages WHERE room = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [room, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      room,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error('Room messages GET error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/chat/messages - Add new message (with room support)
router.post('/messages', async (req, res) => {
  try {
    const { id, room, user, message, type = 'text', url } = req.body;
    if (!id || !room || !user || !message) {
      return res.status(400).json({ success: false, error: 'Missing required fields: id, room, user, message' });
    }

    const db = await getDb();
    // SQLite upsert (id is PRIMARY KEY)
    const query = `
      INSERT INTO messages (id, room, user, message, type, url)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        message = excluded.message,
        type = excluded.type,
        url = excluded.url
    `;
    await db.run(query, [id, room, user, message, type, url]);

    res.json({ success: true, id });
  } catch (err) {
    console.error('Chat POST error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Server info endpoint (REST API)
router.get('/server-info', (req, res) => {
  res.json({
    success: true,
    apiVersion: '1.0',
    endpoints: ['/messages', '/room/:password/messages', '/upload'],
    socketEvents: ['auth_join', 'send_message', 'typing', 'delete_all'],
    maxUsersPerRoom: 2,
    timestamp: new Date().toISOString()
  });
});

// DELETE /api/chat/room/:room/all - Delete ALL messages in room
router.delete('/room/:room/all', async (req, res) => {
  try {
    const { room } = req.params;
    const db = await getDb();
    const result = await db.run('DELETE FROM messages WHERE room = ?', [room]);
    res.json({ success: true, deleted: result.changes || 0, room });
  } catch (err) {
    console.error('Bulk DELETE error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/chat/messages/:id - Delete message
router.delete('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const result = await db.run('DELETE FROM messages WHERE id = ?', [id]);
    res.json({ success: true, deleted: result.changes || 0 });
  } catch (err) {
    console.error('Chat DELETE error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;

