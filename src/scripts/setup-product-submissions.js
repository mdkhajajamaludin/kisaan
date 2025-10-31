const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function setupProductSubmissions() {
  console.log('🚀 Setting up product submission system...\n');

  try {
    // Read the SQL migration file
    const sqlPath = path.join(__dirname, '../migrations/create_product_submissions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 Executing migration SQL...');
    await db.query(sql);

    console.log('✅ Product submission tables created successfully!\n');

    // Verify tables were created
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('product_submission_requests', 'user_product_access')
      ORDER BY table_name;
    `;

    const tablesResult = await db.query(tablesQuery);
    console.log('📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Verify indexes were created
    const indexesQuery = `
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('product_submission_requests', 'user_product_access')
      ORDER BY indexname;
    `;

    const indexesResult = await db.query(indexesQuery);
    console.log('\n📑 Created indexes:');
    indexesResult.rows.forEach(row => {
      console.log(`   ✓ ${row.indexname}`);
    });

    console.log('\n✨ Product submission system setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart your server: npm run dev');
    console.log('   2. Users can now request product access');
    console.log('   3. Admin can approve/reject requests');
    console.log('   4. Approved users can add products\n');

  } catch (error) {
    console.error('❌ Error setting up product submissions:', error);
    throw error;
  }
}

// Run the setup
if (require.main === module) {
  setupProductSubmissions()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

