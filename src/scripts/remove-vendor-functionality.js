const db = require('../config/database');

async function removeVendorFunctionality() {
  try {
    console.log('🗑️  Removing vendor functionality from database...\n');

    // 1. Drop vendor-related tables
    console.log('Dropping vendor tables...');
    await db.query('DROP TABLE IF EXISTS vendor_requests CASCADE');
    await db.query('DROP TABLE IF EXISTS vendors CASCADE');
    await db.query('DROP TABLE IF EXISTS product_submissions CASCADE');
    console.log('✅ Vendor tables dropped\n');

    // 2. Remove vendor_id column from products table (but keep products)
    console.log('Removing vendor_id from products...');
    await db.query('ALTER TABLE products DROP COLUMN IF EXISTS vendor_id CASCADE');
    await db.query('ALTER TABLE products DROP COLUMN IF EXISTS vendor_name CASCADE');
    console.log('✅ vendor_id removed from products\n');

    // 3. Update users table - remove vendor role
    console.log('Removing vendor role from users...');
    await db.query(`UPDATE users SET role = 'user' WHERE role = 'vendor'`);
    console.log('✅ All vendors converted to regular users\n');

    // 4. Clean up any vendor-related notifications
    console.log('Cleaning up vendor notifications...');
    await db.query(`DELETE FROM notifications WHERE type IN ('vendor_request', 'vendor_approved', 'vendor_rejected', 'new_vendor_product')`);
    console.log('✅ Vendor notifications removed\n');

    // Verify cleanup
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%vendor%'
    `);

    if (tables.rows.length > 0) {
      console.log('⚠️  Remaining vendor tables:');
      tables.rows.forEach(row => console.log(`   - ${row.table_name}`));
    } else {
      console.log('✅ All vendor tables removed');
    }

    const productCols = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name LIKE '%vendor%'
    `);

    if (productCols.rows.length > 0) {
      console.log('\n⚠️  Remaining vendor columns in products:');
      productCols.rows.forEach(row => console.log(`   - ${row.column_name}`));
    } else {
      console.log('\n✅ All vendor columns removed from products');
    }

    console.log('\n🎉 Vendor functionality completely removed from database!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error removing vendor functionality:', error);
    process.exit(1);
  }
}

removeVendorFunctionality();
