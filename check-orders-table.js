require('dotenv').config();
const db = require('./src/config/database');

async function checkOrdersTable() {
  try {
    const result = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position`);
    console.log('Orders table structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // Check if we already have a serial_number column
    const hasSerialColumn = result.rows.some(row => row.column_name === 'serial_number');
    console.log(`\nHas serial_number column: ${hasSerialColumn}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOrdersTable();