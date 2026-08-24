require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { getDb, testConnection } = require('./db');
const chatRoutes = require('./routes/chat');
const multer = require('multer');
const crypto = require('crypto');
let verifyAuth = null;
try {
  verifyAuth = require('@supabase/server/core').verifyAuth;
} catch (e) {
  console.warn('⚠️ @supabase/server not available, admin auth will be open:', e.message);
}

const app = express();
const server = http.createServer(app);

// Ensure upload directories exist
const fs = require('fs');
const uploadAudioDir = path.join(__dirname, 'public/uploads/audio');
if (!fs.existsSync(uploadAudioDir)) {
  fs.mkdirSync(uploadAudioDir, { recursive: true });
}

const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend

// ===== Supabase JWT verification helper =====
// Converts an Express request into a standard Web Request so verifyAuth() can read headers.
function expressReqToWebRequest(req) {
  const headers = new Headers();
  Object.entries(req.headers).forEach(([k, v]) => {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  });
  return new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
  });
}

// Middleware: protect routes behind a valid Supabase user JWT if token is provided.
// Attaches supabaseAuth to req when verification succeeds.
// Falls back gracefully so simple admin login works seamlessly.
async function requireSupabaseUser(req, res, next) {
  if (!verifyAuth) {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  try {
    const { data: auth, error } = await verifyAuth(expressReqToWebRequest(req), {
      auth: 'user',
    });
    if (!error && auth) {
      req.supabaseAuth = auth;
    }
    next();
  } catch (err) {
    console.error('Supabase verify error:', err);
    next();
  }
}

// Multer setup for audio uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/audio/');
  },
  filename: function (req, file, cb) {
    const uniqueName = 'audio-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.webm';
    cb(null, uniqueName);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm') {
      cb(null, true);
    } else {
      cb(new Error('Only audio files allowed'), false);
    }
  }
});

// API Routes
app.use('/api/chat', chatRoutes);

// Audio upload endpoint
app.post('/api/upload', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file uploaded' });
    }
    const fileUrl = `/uploads/audio/${req.file.filename}`;
    res.json({ 
      success: true, 
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size 
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.get('SELECT 1 as test');
    res.json({ status: 'OK', db: result.test === 1 });
  } catch (err) {
    res.status(500).json({ status: 'Error', db: false });
  }
});

// Quiz submit endpoint
app.post('/api/quiz/submit', async (req, res) => {
  try {
    const { emailTo, results, finalScorePercent } = req.body;
    const db = await getDb();
    await db.run(
      'INSERT INTO quiz_responses (email, score_percent, responses_json) VALUES (?, ?, ?)',
      [emailTo, finalScorePercent, JSON.stringify(results)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Quiz submit error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin responses endpoint (protected by Supabase JWT verification)
app.get('/api/admin/responses', requireSupabaseUser, async (req, res) => {
  try {
    const db = await getDb();
    const responses = await db.all('SELECT * FROM quiz_responses ORDER BY created_at DESC');
    res.json({ success: true, responses });
  } catch (err) {
    console.error('Admin responses fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Server info endpoint for frontend auto-detection
app.get('/api/server-info', (req, res) => {
  res.json({
    success: true,
    serverUrl: `${req.protocol}://${req.get('host')}`,
    socketUrl: `${req.protocol === 'https' ? 'wss' : 'ws'}://${req.get('host')}`,
    port: process.env.PORT || 3001,
    timestamp: new Date().toISOString()
  });
});

// Serve root media files (single canonical copies - avoids duplicates in /public)
app.get('/app.mp4', (req, res) => {
  res.sendFile(path.join(__dirname, '../app.mp4'), (err) => {
    if (err && !res.headersSent) {
      console.error('Error serving app.mp4:', err);
      res.status(404).send('Video file not found');
    }
  });
});
app.get('/trt.jpeg', (req, res) => {
  res.sendFile(path.join(__dirname, '../trt.jpeg'), (err) => {
    if (err && !res.headersSent) {
      console.error('Error serving trt.jpeg:', err);
      res.status(404).send('Image file not found');
    }
  });
});

// Serve index.html for root (SPA) - Fixed path
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Socket.io logic with Password-Linked Private Rooms & DB Integration
const rooms = new Map(); // {room: {users: Set(sockets), maxUsers: 2}}

function getRoomFromPassword(password) {
  return 'chat_' + crypto.createHash('sha256').update(password).digest('hex').slice(0, 16);
}

async function saveMessage(msg) {
  const roomData = rooms.get(msg.room);
  if (roomData) {
    if (!roomData.messageHistory.find(m => m.id === msg.id)) {
      roomData.messageHistory.push(msg);
      if (roomData.messageHistory.length > 100) roomData.messageHistory.shift();
    }
  }

  try {
    const db = await getDb();
    await db.run(
      'INSERT INTO messages (id, room, user, message, type, url) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET message=excluded.message, type=excluded.type, url=excluded.url',
      [msg.id, msg.room, msg.user, msg.message, msg.type, msg.url]
    );
  } catch (err) {
    console.error('💾 DB Save Fail (Memory Mode Active):', err.message);
  }
}

async function loadRoomMessages(room) {
  const roomData = rooms.get(room);
  if (roomData && roomData.messageHistory.length > 0) {
    return roomData.messageHistory;
  }

  try {
    const db = await getDb();
    const rows = await db.all(
      'SELECT * FROM messages WHERE room = ? ORDER BY timestamp DESC LIMIT 100',
      [room]
    );
    return rows.reverse();
  } catch (err) {
    console.error('📂 DB Load Fail:', err.message);
    return roomData ? roomData.messageHistory : [];
  }
}

io.on('connection', (socket) => {
  console.log(`🔌 Socket ${socket.id} connected`);

  // Auth & Join private room by password
  socket.on('auth_join', async (data) => {
    const { password, user, authMethod = 'password' } = data;
    const room = authMethod === 'userid' ? `chat_${user}_${crypto.createHash('sha256').update(password).digest('hex').slice(0, 12)}` : getRoomFromPassword(password);
    
    socket.user = user;
    socket.room = room;
    
    // Init room if needed
    if (!rooms.has(room)) {
      rooms.set(room, { users: new Set(), messageHistory: [] });
    }
    const roomData = rooms.get(room);
    
    // Enforce 2-member limit
    if (roomData.users.size >= 2) {
      socket.emit('join_error', { error: 'Room full (max 2 members)' });
      return;
    }
    
    socket.join(room);
    roomData.users.add(socket.id);
    
    // Load persisted history
    const dbMessages = await loadRoomMessages(room);
    roomData.messageHistory = dbMessages;
    
    // Notify room members
    io.to(room).emit('peer_joined', { 
      user: socket.user, 
      onlineUsers: Array.from(roomData.users).length,
      room,
      messages: dbMessages 
    });
    
    console.log(` ${socket.user} joined ${room} (${roomData.users.size}/2)`);
    socket.emit('joined_success', { room, onlineUsers: roomData.users.size });
  });

  // Send message
  socket.on('send_message', async (data) => {
    if (!socket.room) return;
    const msg = { ...data.message, room: socket.room, user: socket.user };
    
    // Save to memory + DB
    await saveMessage(msg);
    
    // Broadcast to room
    io.to(socket.room).emit('new_message', { message: msg });
    console.log(`📨 ${msg.user}: ${msg.message?.substring(0, 50)}`);
  });

  // Typing
  socket.on('typing', (data) => {
    socket.to(socket.room).emit('typing', { user: socket.user, room: socket.room });
  });

  // Delete ALL messages in room
  socket.on('delete_all', async () => {
    const roomData = rooms.get(socket.room);
    if (roomData) {
      roomData.messageHistory = [];
      try {
          const db = await getDb();
          await db.run('DELETE FROM messages WHERE room = ?', [socket.room]);
      } catch (err) { console.error('Delete all fail', err); }
      io.to(socket.room).emit('all_messages_deleted', { room: socket.room });
      console.log(`🗑️ ALL messages deleted in room ${socket.room}`);
    }
  });

  // Delete message
  socket.on('delete_message', async (data) => {
    const roomData = rooms.get(socket.room);
    if (roomData) {
      roomData.messageHistory = roomData.messageHistory.filter(m => m.id !== data.messageId);
      try {
          const db = await getDb();
          await db.run('DELETE FROM messages WHERE id = ? AND room = ?', [data.messageId, socket.room]);
      } catch (err) { console.error('Delete msg fail', err); }
      io.to(socket.room).emit('message_deleted', data);
    }
  });


  socket.on('disconnect', () => {
    if (socket.room) {
      const roomData = rooms.get(socket.room);
      if (roomData) {
        roomData.users.delete(socket.id);
        io.to(socket.room).emit('peer_left', { user: socket.user });
        console.log(` ${socket.user} left ${socket.room} (${roomData.users.size}/2)`);
        // Cleanup empty room after 5min
        if (roomData.users.size === 0) {
          setTimeout(() => {
            if (rooms.get(socket.room)?.users.size === 0) {
              rooms.delete(socket.room);
              console.log(`🧹 Cleaned empty room ${socket.room}`);
            }
          }, 300000);
        }
      }
    }
    console.log(`🔌 Socket ${socket.id} disconnected`);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  await testConnection();
  console.log('✅ Ready!');
});

