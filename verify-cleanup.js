require('dotenv').config();
const db = require('./src/config/database');

async function verifyCleanup() {
  try {
    console.log('🔍 Verifying data cleanup...\n');
    
    // Check admin user still exists
    const adminResult = await db.query(`SELECT id, email, name, role FROM users WHERE email = 'dev.unity.cc@gmail.com'`);
    if (adminResult.rows.length > 0) {
      console.log('✅ Admin user preserved:');
      console.log(`   ID: ${adminResult.rows[0].id}`);
      console.log(`   Email: ${adminResult.rows[0].email}`);
      console.log(`   Name: ${adminResult.rows[0].name}`);
      console.log(`   Role: ${adminResult.rows[0].role}\n`);
    } else {
      console.log('❌ Admin user not found!\n');
    }
    
    // Count records in each table
    const tables = [
      'users', 
      'cart_items', 
      'wishlist_items', 
      'user_addresses', 
      'notifications', 
      'orders', 
      'order_items',
      'products',
      'product_submission_requests',
      'user_product_access'
    ];
    
    for (const table of tables) {
      try {
        const countResult = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`📊 ${table}: ${countResult.rows[0].count} records`);
      } catch (error) {
        console.log(`ℹ️  ${table}: Table may not exist or error occurred`);
      }
    }
    
    console.log('\n✅ Verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during verification:', error);
    process.exit(1);
  }
}

verifyCleanup();