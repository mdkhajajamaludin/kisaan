// Debug the authentication issue
require('dotenv').config();
const db = require('./src/config/database');

async function debugAuthIssue() {
  try {
    console.log('🔍 Debugging authentication issue...');
    
    // Check current admin users
    console.log('\n1. Checking admin users in database...');
    const adminUsers = await db.query(`
      SELECT id, email, name, role, is_active, can_add_products, created_at
      FROM users 
      WHERE role = 'admin' OR email = 'dev.unity.cc@gmail.com'
      ORDER BY created_at DESC
    `);
    
    console.log('Admin users found:', adminUsers.rows.length);
    adminUsers.rows.forEach(user => {
      console.log(`  - ${user.email} (ID: ${user.id}, Role: ${user.role}, Active: ${user.is_active})`);
    });
    
    // Check if dev.unity.cc@gmail.com exists and has admin role
    const devUser = await db.query(`
      SELECT * FROM users WHERE email = 'dev.unity.cc@gmail.com'
    `);
    
    if (devUser.rows.length === 0) {
      console.log('\n❌ dev.unity.cc@gmail.com user not found in database!');
      console.log('Creating admin user...');
      
      await db.query(`
        INSERT INTO users (email, name, role, is_active, can_add_products)
        VALUES ('dev.unity.cc@gmail.com', 'Dev Admin', 'admin', true, true)
        ON CONFLICT (email) DO UPDATE SET
          role = 'admin',
          is_active = true,
          can_add_products = true
      `);
      
      console.log('✅ Admin user created/updated');
    } else {
      const user = devUser.rows[0];
      console.log(`\n✅ Found dev.unity.cc@gmail.com:`, {
        id: user.id,
        role: user.role,
        is_active: user.is_active,
        can_add_products: user.can_add_products
      });
      
      if (user.role !== 'admin') {
        console.log('🔧 Updating user role to admin...');
        await db.query(`
          UPDATE users 
          SET role = 'admin', is_active = true, can_add_products = true
          WHERE email = 'dev.unity.cc@gmail.com'
        `);
        console.log('✅ User role updated to admin');
      }
    }
    
    // Check vendor requests
    console.log('\n2. Checking vendor requests...');
    const vendorRequests = await db.query(`
      SELECT vr.*, u.name as user_name, u.email as user_email
      FROM vendor_requests vr
      LEFT JOIN users u ON vr.user_id = u.id
      ORDER BY vr.created_at DESC
      LIMIT 5
    `);
    
    console.log('Vendor requests found:', vendorRequests.rows.length);
    vendorRequests.rows.forEach(req => {
      console.log(`  - ${req.business_name} by ${req.user_email} (Status: ${req.status})`);
    });
    
    // Check vendors
    console.log('\n3. Checking vendors...');
    const vendors = await db.query(`
      SELECT u.id, u.email, u.name, u.role, u.is_active, u.can_add_products
      FROM users u
      WHERE u.role = 'vendor' OR u.can_add_products = true
      ORDER BY u.created_at DESC
      LIMIT 5
    `);
    
    console.log('Vendors found:', vendors.rows.length);
    vendors.rows.forEach(vendor => {
      console.log(`  - ${vendor.email} (Role: ${vendor.role}, Active: ${vendor.is_active}, Can Add Products: ${vendor.can_add_products})`);
    });
    
    console.log('\n🎉 Authentication debug complete!');
    
  } catch (error) {
    console.error('💥 Debug failed:', error);
  } finally {
    process.exit(0);
  }
}

debugAuthIssue();