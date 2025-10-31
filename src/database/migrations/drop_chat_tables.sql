-- Drop Chat System Tables
-- Run this script to remove all chat-related tables from the database

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS chat_blocks CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS chat_requests CASCADE;
DROP TABLE IF EXISTS blocked_chat_users CASCADE;

-- Drop any related indexes (if they weren't dropped with CASCADE)
DROP INDEX IF EXISTS idx_chat_messages_sender;
DROP INDEX IF EXISTS idx_chat_messages_receiver;
DROP INDEX IF EXISTS idx_chat_messages_created_at;
DROP INDEX IF EXISTS idx_chat_blocks_user;
DROP INDEX IF EXISTS idx_chat_sessions_user;
DROP INDEX IF EXISTS idx_chat_requests_user;

-- Verify tables are dropped
SELECT 
  table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%chat%'
ORDER BY table_name;

-- If the above query returns no rows, all chat tables have been successfully removed
