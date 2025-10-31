const db = require('../config/database');

async function createAddressesTable() {
  try {
    console.log('🔧 Creating user_addresses table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        street TEXT NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        zip_code VARCHAR(20) NOT NULL,
        country VARCHAR(100) DEFAULT 'India',
        phone VARCHAR(20),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ user_addresses table created');

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_addresses_is_default ON user_addresses(is_default);
    `);

    console.log('✅ Indexes created');

    // Verify table structure
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'user_addresses'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 Table structure:');
    result.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });

    console.log('\n🎉 Addresses table setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createAddressesTable();
