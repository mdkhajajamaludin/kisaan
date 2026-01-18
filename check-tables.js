// Check if tables exist
const db = require('./src/config/database');

async function checkTables() {
  try {
    console.log('Checking if vendor_requests table exists...');
    
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'vendor_requests'
      );
    `);
    
    console.log('vendor_requests table exists:', tableExists.rows[0].exists);
    
    if (!tableExists.rows[0].exists) {
      console.log('Creating vendor_requests table...');
      
      // Create the basic vendor_requests table
      await db.query(`
        CREATE TABLE vendor_requests (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          business_name VARCHAR(255) NOT NULL,
          business_type VARCHAR(100),
          description TEXT,
          contact_info JSONB,
          documents JSONB DEFAULT '[]',
          status VARCHAR(50) DEFAULT 'pending',
          admin_notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('✅ vendor_requests table created!');
    }
    
    // Now check the columns
    const columns = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'vendor_requests'
      ORDER BY ordinal_position;
    `);
    
    console.log('Table structure:');
    console.table(columns.rows);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkTables();