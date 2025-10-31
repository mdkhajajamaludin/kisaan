const db = require('./src/config/database');

async function checkNotifications() {
  try {
    console.log('\n🔍 CHECKING NOTIFICATION TIMESTAMPS...\n');
    
    // Check column info
    const colInfo = await db.query(`
      SELECT column_name, column_default, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications' AND column_name = 'created_at'
    `);
    
    console.log('📋 CREATED_AT COLUMN INFO:');
    console.log(colInfo.rows[0]);
    
    // Check recent notifications
    const recent = await db.query(`
      SELECT id, created_at, NOW() as current_time,
             EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_ago
      FROM notifications 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    console.log('\n📍 RECENT NOTIFICATIONS:');
    recent.rows.forEach(n => {
      console.log(`  ID: ${n.id} | Created: ${n.created_at} | Hours ago: ${Math.round(n.hours_ago * 10) / 10}`);
    });
    
    console.log('\n✅ Check complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkNotifications();
