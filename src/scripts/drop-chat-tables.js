const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function dropChatTables() {
  try {
    console.log('🗑️  Dropping chat tables...\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, '../database/migrations/drop_chat_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    await db.query(sql);

    console.log('✅ Chat tables dropped successfully!\n');

    // Verify tables were dropped
    const verifyQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '%chat%'
      ORDER BY table_name;
    `;
    
    const result = await db.query(verifyQuery);
    
    if (result.rows.length === 0) {
      console.log('✅ Verification successful - all chat tables have been removed\n');
    } else {
      console.log('⚠️  Warning: Some chat-related tables still exist:');
      result.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }

    console.log('✨ Chat system removal complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error dropping chat tables:', error);
    process.exit(1);
  }
}

dropChatTables();
