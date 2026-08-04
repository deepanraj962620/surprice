# HDB

# 🎉 Happy Birthday Chat App - FIXED for Internet Hosting!

## Problem Fixed ✅
**Messages now sync LIVE between phones over internet!** (was localhost-only)

## Quick Start (5 mins)

### 1. Start Backend Server
```
cd backend
npm start
```
✅ See: `Server running on http://localhost:3001`

### 2. Public Hosting (ngrok - free)
```
# Install ngrok: https://ngrok.com/download
ngrok http 3001
```
Copy **HTTPS URL** e.g. `https://abc-123.ngrok-free.app`

### 3. Test on 2 Phones!
```
Phone 1 & 2: https://abc-123.ngrok-free.app/?server=wss://abc-123.ngrok-free.app
```
- Navigate to **Section 5** (Live Chat)
- Password: `buji2005`
- Names: Nike / Buji
- **Messages sync instantly!** 🎤 Voice too!

## Features
- ✅ **Live sync** 2 phones max/room
- ✅ Voice messages (2min)
- ✅ Camera photos
- ✅ File uploads
- ✅ Delete all/single
- ✅ Password rooms
- 🔄 localStorage fallback (same device tabs)

## Production Deploy (Free)
```
1. Railway.app / Render.com → Deploy backend
2. Copy public URL
3. Frontend: index.html → Serve static → ?server=YOUR_URL
```

## DB (Optional)
```
mysql -u root -p nike_birthday_db < backend/init.sql
# Edit backend/.env DB_PASSWORD
```

**Passwords:** buji2005, nike2024, birthday, love

**Enjoy the birthday chat! 🎂**

