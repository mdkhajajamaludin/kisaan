const db = require('./src/config/database');

// Helper function to check if a table exists
async function tableExists(tableName) {
  try {
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    return result.rows[0].exists;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

async function clearUserData() {
  try {
    console.log('🧹 Clearing user data while preserving admin user and table structures...');
    
    // First, let's find the admin user ID
    const adminResult = await db.query(`SELECT id FROM users WHERE email = 'dev.unity.cc@gmail.com'`);
    let adminId = null;
    if (adminResult.rows.length > 0) {
      adminId = adminResult.rows[0].id;
      console.log(`✅ Found admin user with ID: ${adminId}`);
    } else {
      console.log('⚠️  No admin user found with email dev.unity.cc@gmail.com');
    }
    
    // Clear cart items (except for admin if exists)
    if (adminId) {
      await db.query(`DELETE FROM cart_items WHERE user_id != $1`, [adminId]);
      console.log('✅ Cleared cart items (preserved admin cart if exists)');
    } else {
      await db.query(`DELETE FROM cart_items`);
      console.log('✅ Cleared all cart items');
    }
    
    // Clear wishlist items (except for admin if exists)
    if (adminId) {
      await db.query(`DELETE FROM wishlist_items WHERE user_id != $1`, [adminId]);
      console.log('✅ Cleared wishlist items (preserved admin wishlist if exists)');
    } else {
      await db.query(`DELETE FROM wishlist_items`);
      console.log('✅ Cleared all wishlist items');
    }
    
    // Clear user addresses (except for admin if exists)
    if (adminId) {
      await db.query(`DELETE FROM user_addresses WHERE user_id != $1`, [adminId]);
      console.log('✅ Cleared user addresses (preserved admin addresses if exists)');
    } else {
      await db.query(`DELETE FROM user_addresses`);
      console.log('✅ Cleared all user addresses');
    }
    
    // Clear notifications (except for admin if exists)
    if (adminId) {
      await db.query(`DELETE FROM notifications WHERE user_id != $1`, [adminId]);
      console.log('✅ Cleared notifications (preserved admin notifications if exists)');
    } else {
      await db.query(`DELETE FROM notifications`);
      console.log('✅ Cleared all notifications');
    }
    
    // Clear orders and order items (except for admin if exists)
    if (adminId) {
      // First delete order items for non-admin orders
      await db.query(`
        DELETE FROM order_items 
        WHERE order_id IN (
          SELECT id FROM orders WHERE user_id != $1
        )
      `, [adminId]);
      
      // Then delete orders (except admin orders)
      await db.query(`DELETE FROM orders WHERE user_id != $1`, [adminId]);
      console.log('✅ Cleared orders (preserved admin orders if exists)');
    } else {
      // Delete all order items first (due to foreign key constraints)
      await db.query(`DELETE FROM order_items`);
      // Then delete all orders
      await db.query(`DELETE FROM orders`);
      console.log('✅ Cleared all orders');
    }
    
    // Clear user product access first (due to foreign key constraints)
    if (await tableExists('user_product_access')) {
      if (adminId) {
        await db.query(`DELETE FROM user_product_access WHERE user_id != $1`, [adminId]);
        console.log('✅ Cleared user product access (preserved admin access if exists)');
      } else {
        await db.query(`DELETE FROM user_product_access`);
        console.log('✅ Cleared all user product access');
      }
    } else {
      console.log('ℹ️  user_product_access table does not exist, skipping');
    }
    
    // Clear product submission requests
    if (await tableExists('product_submission_requests')) {
      if (adminId) {
        await db.query(`DELETE FROM product_submission_requests WHERE user_id != $1`, [adminId]);
        console.log('✅ Cleared product submission requests (preserved admin requests if exists)');
      } else {
        await db.query(`DELETE FROM product_submission_requests`);
        console.log('✅ Cleared all product submission requests');
      }
    } else {
      console.log('ℹ️  product_submission_requests table does not exist, skipping');
    }
    
    // Clear vendor requests (these are not user-specific data, but let's keep them clean)
    if (await tableExists('vendor_requests')) {
      await db.query(`DELETE FROM vendor_requests`);
      console.log('✅ Cleared vendor requests');
    } else {
      console.log('ℹ️  vendor_requests table does not exist, skipping');
    }
    
    // Clear products (except those belonging to admin if they're a vendor)
    if (adminId) {
      await db.query(`DELETE FROM products WHERE vendor_id != $1`, [adminId]);
      console.log('✅ Cleared products (preserved admin products if exists)');
    } else {
      await db.query(`DELETE FROM products`);
      console.log('✅ Cleared all products');
    }
    
    // Clear users (except admin)
    if (adminId) {
      await db.query(`DELETE FROM users WHERE id != $1`, [adminId]);
      console.log('✅ Cleared users (preserved admin user)');
    } else {
      // Don't delete the last user if no admin found
      const userCount = await db.query(`SELECT COUNT(*) as count FROM users`);
      if (userCount.rows[0].count > 0) {
        console.log('⚠️  No admin user found, preserving all existing users');
      } else {
        console.log('✅ No users to clear');
      }
    }
    
    console.log('\n🎉 User data clearing completed successfully!');
    console.log('   • All user data has been cleared');
    console.log('   • Table structures remain intact');
    console.log('   • Admin user has been preserved');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing user data:', error);
    process.exit(1);
  }
}

clearUserData();