-- Updated MySQL schema for 2-Member Password-Linked Chat
-- Run: mysql -u root -p < init.sql (creates DB)

CREATE DATABASE IF NOT EXISTS nike_birthday_db;
USE nike_birthday_db;

DROP TABLE IF EXISTS messages;

CREATE TABLE messages (
  id VARCHAR(100) PRIMARY KEY,
  room VARCHAR(100) NOT NULL,
  user VARCHAR(50) NOT NULL,
  message LONGTEXT,
  type ENUM('text', 'image', 'video', 'voice') DEFAULT 'text',
  url LONGTEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room (room),
  INDEX idx_user (user),
  INDEX idx_timestamp (timestamp)
);

-- Clear old data
DELETE FROM messages;

SELECT 'Database updated for password-linked rooms!' as status;

