// Test database connection from server directory
const db = require('./src/config/database');

async function testDB() {
  try {
    console.log('Testing database connection...');
    
    const result = await db.query('SELECT NOW() as current_time');
    console.log('✅ Database connected!');
    console.log('Current time:', result.rows[0].current_time);
    
    // Check vendor_requests table
    const tableCheck = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'vendor_requests'
      ORDER BY ordinal_position;
    `);
    
    console.log('vendor_requests table columns:');
    console.table(tableCheck.rows);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    process.exit(0);
  }
}

testDB();