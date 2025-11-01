require('dotenv').config();
const db = require('./src/config/database');

async function verifySerialNumbers() {
  try {
    console.log('🔍 Verifying order serial numbers...\n');
    
    // Get all orders with their serial numbers
    const result = await db.query(`
      SELECT id, user_id, serial_number, created_at 
      FROM orders 
      ORDER BY user_id, created_at
    `);
    
    console.log('Orders with serial numbers:');
    result.rows.forEach(row => {
      console.log(`  Order ID: ${row.id} | User ID: ${row.user_id} | Serial: ${row.serial_number} | Date: ${new Date(row.created_at).toLocaleDateString()}`);
    });
    
    // Group by user to verify user-specific numbering
    const userOrders = {};
    result.rows.forEach(row => {
      if (!userOrders[row.user_id]) {
        userOrders[row.user_id] = [];
      }
      userOrders[row.user_id].push(row);
    });
    
    console.log('\n📊 User-specific order numbering verification:');
    Object.keys(userOrders).forEach(userId => {
      console.log(`  User ${userId}:`);
      userOrders[userId].forEach((order, index) => {
        console.log(`    ${index + 1}. Order ${order.id} - ${order.serial_number}`);
      });
    });
    
    console.log('\n✅ Serial number verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifySerialNumbers();