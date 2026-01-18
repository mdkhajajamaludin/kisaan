// Check users table
const db = require('./src/config/database');

async function checkUsers() {
  try {
    console.log('Checking users table...');
    
    // Check if users table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `);
    
    console.log('users table exists:', tableExists.rows[0].exists);
    
    if (tableExists.rows[0].exists) {
      // Check users count
      const userCount = await db.query('SELECT COUNT(*) FROM users');
      console.log('Total users:', userCount.rows[0].count);
      
      // Show first few users
      const users = await db.query('SELECT id, email, name, firebase_uid FROM users LIMIT 5');
      console.log('Sample users:');
      console.table(users.rows);
    } else {
      console.log('❌ Users table does not exist!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkUsers();