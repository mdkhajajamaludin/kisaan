-- Add indexes to notifications table for lightning-fast performance
-- This migration adds optimized indexes for common query patterns

-- Index for user_id lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
ON notifications(user_id);

-- Composite index for user_id + read status (for unread queries)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
ON notifications(user_id, read) 
WHERE read = false;

-- Index for created_at for sorting (DESC order for recent first)
CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
ON notifications(created_at DESC);

-- Composite index for user_id + created_at (optimal for user's recent notifications)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
ON notifications(user_id, created_at DESC);

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_notifications_type 
ON notifications(type);

-- Composite index for user_id + type (for filtered user queries)
CREATE INDEX IF NOT EXISTS idx_notifications_user_type 
ON notifications(user_id, type);

-- Partial index for unread notifications only (saves space)
CREATE INDEX IF NOT EXISTS idx_notifications_unread 
ON notifications(user_id, created_at DESC) 
WHERE read = false;

-- Add index on id for faster single notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_id 
ON notifications(id);

-- Analyze the table to update statistics for query planner
ANALYZE notifications;

-- Display index information
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'notifications'
ORDER BY indexname;

