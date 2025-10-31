const db = require('../config/database');

async function addNotificationIndexes() {
  console.log('🚀 Adding notification indexes for lightning-fast performance...\n');

  try {
    // Index for user_id lookups (most common query)
    console.log('Creating idx_notifications_user_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
      ON notifications(user_id)
    `);
    console.log('✅ idx_notifications_user_id created\n');

    // Composite index for user_id + read status (for unread queries)
    console.log('Creating idx_notifications_user_read...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
      ON notifications(user_id, read) 
      WHERE read = false
    `);
    console.log('✅ idx_notifications_user_read created\n');

    // Index for created_at for sorting (DESC order for recent first)
    console.log('Creating idx_notifications_created_at...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
      ON notifications(created_at DESC)
    `);
    console.log('✅ idx_notifications_created_at created\n');

    // Composite index for user_id + created_at (optimal for user's recent notifications)
    console.log('Creating idx_notifications_user_created...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
      ON notifications(user_id, created_at DESC)
    `);
    console.log('✅ idx_notifications_user_created created\n');

    // Index for type filtering
    console.log('Creating idx_notifications_type...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_type 
      ON notifications(type)
    `);
    console.log('✅ idx_notifications_type created\n');

    // Composite index for user_id + type (for filtered user queries)
    console.log('Creating idx_notifications_user_type...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_type 
      ON notifications(user_id, type)
    `);
    console.log('✅ idx_notifications_user_type created\n');

    // Partial index for unread notifications only (saves space)
    console.log('Creating idx_notifications_unread...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_unread 
      ON notifications(user_id, created_at DESC) 
      WHERE read = false
    `);
    console.log('✅ idx_notifications_unread created\n');

    // Analyze the table to update statistics for query planner
    console.log('Analyzing notifications table...');
    await db.query('ANALYZE notifications');
    console.log('✅ Table analyzed\n');

    // Display index information
    console.log('📊 Current indexes on notifications table:');
    const result = await db.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'notifications'
      ORDER BY indexname
    `);

    result.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

    console.log('\n✨ All indexes created successfully!');
    console.log('🚀 Notification queries will now be lightning fast!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding indexes:', error);
    process.exit(1);
  }
}

addNotificationIndexes();

