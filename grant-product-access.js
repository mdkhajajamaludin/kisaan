const db = require('./src/config/database');

async function grantProductAccess() {
  try {
    console.log('Granting product access to all users...');
    
    // Get all users
    const usersResult = await db.query('SELECT id, email, role FROM users');
    console.log(`Found ${usersResult.rows.length} users`);
    
    for (const user of usersResult.rows) {
      console.log(`\nProcessing user: ${user.email} (ID: ${user.id}, Role: ${user.role})`);
      
      // Check if user already has product access
      const accessCheck = await db.query(
        'SELECT * FROM user_product_access WHERE user_id = $1',
        [user.id]
      );
      
      if (accessCheck.rows.length > 0) {
        console.log(`  ✓ User already has product access`);
        
        // Update to ensure it's active
        await db.query(
          `UPDATE user_product_access 
           SET is_approved = true, 
               revoked_at = NULL,
               max_products = 1000,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1`,
          [user.id]
        );
        console.log(`  ✓ Access updated and activated`);
      } else {
        // Grant new product access
        await db.query(
          `INSERT INTO user_product_access (
            user_id, is_approved, max_products, notes, created_at, updated_at
          ) VALUES ($1, true, 1000, 'Auto-granted access', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [user.id]
        );
        console.log(`  ✓ Product access granted`);
      }
    }
    
    console.log('\n✅ All users now have product access!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

grantProductAccess();
