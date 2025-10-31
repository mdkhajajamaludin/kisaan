const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🚀 Running cart and wishlist tables migration...');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/migrations/add_cart_wishlist_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await db.query(migrationSQL);

    console.log('✅ Cart and wishlist tables created successfully!');
    console.log('✅ Indexes created successfully!');
    console.log('✅ Triggers created successfully!');
    
    // Verify tables exist
    const checkTables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('cart_items', 'wishlist_items')
    `);

    console.log('\n📊 Created tables:');
    checkTables.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    console.log('\n🎉 Migration completed successfully!');
    console.log('💾 Cart and wishlist data will now be stored in the database instead of localStorage');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
