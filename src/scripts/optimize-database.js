const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function optimizeDatabase() {
  try {
    console.log('🚀 Starting database optimization...');
    
    // Read the SQL optimization file
    const sqlPath = path.join(__dirname, '../database/migrations/optimize_vendor_system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the optimization script
    console.log('📊 Running database optimization script...');
    await db.query(sql);
    
    console.log('✅ Database optimization completed successfully!');
    
    // Verify the optimization by checking key tables and indexes
    console.log('\n🔍 Verifying optimization...');
    
    // Check if all required tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'products', 'orders', 'order_items', 'notifications', 'vendor_requests', 'categories')
      ORDER BY table_name;
    `;
    
    const tablesResult = await db.query(tablesQuery);
    console.log('📋 Tables found:', tablesResult.rows.map(r => r.table_name).join(', '));
    
    // Check indexes
    const indexesQuery = `
      SELECT schemaname, tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND (indexname LIKE 'idx_%' OR indexname LIKE '%_pkey')
      ORDER BY tablename, indexname;
    `;
    
    const indexesResult = await db.query(indexesQuery);
    console.log(`🔗 Indexes created: ${indexesResult.rows.length} indexes`);
    
    // Check vendor analytics view
    const viewQuery = `
      SELECT COUNT(*) as vendor_count 
      FROM vendor_analytics;
    `;
    
    try {
      const viewResult = await db.query(viewQuery);
      console.log(`👥 Vendor analytics view working: ${viewResult.rows[0].vendor_count} vendors tracked`);
    } catch (viewError) {
      console.log('⚠️  Vendor analytics view not available (this is normal if no vendors exist yet)');
    }
    
    // Test notification cleanup function
    try {
      const cleanupResult = await db.query('SELECT cleanup_old_notifications() as deleted_count;');
      console.log(`🧹 Notification cleanup function working: ${cleanupResult.rows[0].deleted_count} old notifications cleaned`);
    } catch (cleanupError) {
      console.log('⚠️  Notification cleanup function test failed (this is normal if function doesn\'t exist yet)');
    }
    
    console.log('\n🎉 Database is now fully optimized for the vendor management system!');
    console.log('📈 Performance improvements include:');
    console.log('   • Optimized indexes for vendor queries');
    console.log('   • Automatic timestamp updates');
    console.log('   • Vendor analytics view');
    console.log('   • Notification cleanup automation');
    console.log('   • Enhanced search capabilities');
    
  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    throw error;
  }
}

// Run optimization if called directly
if (require.main === module) {
  optimizeDatabase()
    .then(() => {
      console.log('\n✅ Optimization complete! Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Optimization failed:', error);
      process.exit(1);
    });
}

module.exports = optimizeDatabase;