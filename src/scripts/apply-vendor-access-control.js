const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function applyVendorAccessControl() {
  try {
    console.log('🔧 Applying vendor access control migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/migrations/add_vendor_access_control.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await db.query(migrationSQL);
    
    console.log('✅ Vendor access control migration applied successfully');
    
    // Verify the changes
    const verifyQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'vendor' THEN 1 END) as vendors,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins,
        COUNT(CASE WHEN can_add_products = true THEN 1 END) as users_with_product_access,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users
      FROM users
    `;
    
    const result = await db.query(verifyQuery);
    const stats = result.rows[0];
    
    console.log('📊 User access control stats:');
    console.log(`   Total users: ${stats.total_users}`);
    console.log(`   Vendors: ${stats.vendors}`);
    console.log(`   Admins: ${stats.admins}`);
    console.log(`   Users with product access: ${stats.users_with_product_access}`);
    console.log(`   Active users: ${stats.active_users}`);
    
    // Test vendor analytics view
    const analyticsTest = await db.query('SELECT COUNT(*) as vendor_count FROM vendor_analytics');
    console.log(`   Vendor analytics view: ${analyticsTest.rows[0].vendor_count} vendors tracked`);
    
    console.log('🎉 Vendor access control system is ready!');
    
  } catch (error) {
    console.error('❌ Error applying vendor access control migration:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  applyVendorAccessControl()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = applyVendorAccessControl;