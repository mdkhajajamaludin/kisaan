const db = require('./src/config/database');

async function checkAddresses() {
  try {
    console.log('\n✅ CHECKING USER_ADDRESSES TABLE...\n');
    
    // Check table structure
    const structure = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_addresses' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 TABLE STRUCTURE:');
    console.log('==================');
    structure.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} | ${col.data_type}`);
    });
    
    // Count total addresses
    const count = await db.query('SELECT COUNT(*) as total FROM user_addresses');
    console.log('\n📊 STATISTICS:');
    console.log('==============');
    console.log(`  Total Addresses: ${count.rows[0].total}`);
    
    // Show recent addresses
    const recent = await db.query(`
      SELECT id, user_id, name, city, state, is_default, created_at 
      FROM user_addresses 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    if (recent.rows.length > 0) {
      console.log('\n📍 RECENT ADDRESSES:');
      console.log('===================');
      recent.rows.forEach(addr => {
        console.log(`  ID: ${addr.id} | User: ${addr.user_id} | ${addr.name} | ${addr.city}, ${addr.state} | Default: ${addr.is_default ? 'Yes' : 'No'} | Created: ${new Date(addr.created_at).toLocaleString()}`);
      });
    } else {
      console.log('\n⚠️  No addresses found in database yet.');
      console.log('    Addresses will be saved when users add them in Profile or during Checkout.');
    }
    
    console.log('\n✅ Database check complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAddresses();
