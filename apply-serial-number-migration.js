const db = require('./src/config/database');

async function applyMigration() {
  try {
    console.log('🚀 Applying order serial number migration...');

    // 1. Add serial_number column to orders table
    console.log('1. Adding serial_number column to orders table...');
    await db.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS serial_number VARCHAR(50)
    `);
    console.log('✅ Column added successfully!');

    // 2. Add index for better performance
    console.log('2. Adding index for serial_number column...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_serial_number ON orders(serial_number)
    `);
    console.log('✅ Index added successfully!');

    // 3. Add comment for documentation
    console.log('3. Adding comment for documentation...');
    await db.query(`
      COMMENT ON COLUMN orders.serial_number IS 'User-specific order serial number (e.g., ORD-USERID-0001)'
    `);
    console.log('✅ Comment added successfully!');

    console.log('✅ Migration applied successfully!');
    
    // Update existing orders with serial numbers
    console.log('🔄 Updating existing orders with serial numbers...');
    
    // Get all orders without serial numbers
    const ordersResult = await db.query(`
      SELECT id, user_id 
      FROM orders 
      WHERE serial_number IS NULL 
      ORDER BY created_at ASC
    `);
    
    console.log(`Found ${ordersResult.rows.length} orders to update`);
    
    // Update each order with a serial number
    let updatedCount = 0;
    for (const order of ordersResult.rows) {
      // Count how many orders this user had before this order
      const countResult = await db.query(`
        SELECT COUNT(*) as order_count
        FROM orders
        WHERE user_id = $1 AND created_at <= (
          SELECT created_at FROM orders WHERE id = $2
        )
      `, [order.user_id, order.id]);
      
      const orderCount = parseInt(countResult.rows[0].order_count);
      const serialNumber = `ORD-${order.user_id}-${String(orderCount).padStart(4, '0')}`;
      
      await db.query(`
        UPDATE orders 
        SET serial_number = $1 
        WHERE id = $2
      `, [serialNumber, order.id]);
      
      updatedCount++;
      if (updatedCount % 10 === 0) {
        console.log(`  Updated ${updatedCount} orders...`);
      }
    }
    
    console.log(`✅ All ${updatedCount} existing orders updated with serial numbers!`);
    console.log('\n🎉 Order serial number system is now fully operational!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();