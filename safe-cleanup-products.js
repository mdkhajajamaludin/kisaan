// Safe cleanup script that handles foreign key constraints
const db = require('./src/config/database');

async function safeCleanupProducts() {
  try {
    console.log('🧹 Safely cleaning up all mock/test products from database...\n');
    
    // First, let's see what products exist
    console.log('=== CURRENT PRODUCTS ===');
    const currentProducts = await db.query(`
      SELECT p.id, p.name, p.vendor_id, v.business_name 
      FROM products p 
      LEFT JOIN vendors v ON p.vendor_id = v.id 
      ORDER BY p.id
    `);
    
    if (currentProducts.rows.length > 0) {
      console.log(`Found ${currentProducts.rows.length} products:`);
      currentProducts.rows.forEach(product => {
        console.log(`- ID: ${product.id}, Name: ${product.name}, Vendor: ${product.business_name || 'Unknown'} (${product.vendor_id})`);
      });
      
      // Check for order items that reference these products
      console.log('\n=== CHECKING ORDER ITEMS ===');
      const orderItems = await db.query(`
        SELECT oi.id, oi.product_id, p.name as product_name, oi.order_id
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        ORDER BY oi.product_id
      `);
      
      if (orderItems.rows.length > 0) {
        console.log(`Found ${orderItems.rows.length} order items referencing products:`);
        orderItems.rows.forEach(item => {
          console.log(`- Order Item ID: ${item.id}, Product: ${item.product_name} (${item.product_id}), Order: ${item.order_id}`);
        });
        
        // Delete order items first
        console.log('\n=== DELETING ORDER ITEMS ===');
        const deleteOrderItems = await db.query('DELETE FROM order_items');
        console.log(`✅ Deleted ${deleteOrderItems.rowCount} order items`);
        
        // Also delete orders since they'll be empty now
        console.log('\n=== DELETING ORDERS ===');
        const deleteOrders = await db.query('DELETE FROM orders');
        console.log(`✅ Deleted ${deleteOrders.rowCount} orders`);
      } else {
        console.log('No order items found referencing products');
      }
      
      // Check for cart items that reference these products
      console.log('\n=== CHECKING CART ITEMS ===');
      const cartItems = await db.query(`
        SELECT ci.id, ci.product_id, p.name as product_name
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        ORDER BY ci.product_id
      `);
      
      if (cartItems.rows.length > 0) {
        console.log(`Found ${cartItems.rows.length} cart items referencing products:`);
        cartItems.rows.forEach(item => {
          console.log(`- Cart Item ID: ${item.id}, Product: ${item.product_name} (${item.product_id})`);
        });
        
        // Delete cart items
        console.log('\n=== DELETING CART ITEMS ===');
        const deleteCartItems = await db.query('DELETE FROM cart_items');
        console.log(`✅ Deleted ${deleteCartItems.rowCount} cart items`);
      } else {
        console.log('No cart items found referencing products');
      }
      
      // Check for wishlist items that reference these products
      console.log('\n=== CHECKING WISHLIST ITEMS ===');
      const wishlistItems = await db.query(`
        SELECT wi.id, wi.product_id, p.name as product_name
        FROM wishlist_items wi
        JOIN products p ON wi.product_id = p.id
        ORDER BY wi.product_id
      `);
      
      if (wishlistItems.rows.length > 0) {
        console.log(`Found ${wishlistItems.rows.length} wishlist items referencing products:`);
        wishlistItems.rows.forEach(item => {
          console.log(`- Wishlist Item ID: ${item.id}, Product: ${item.product_name} (${item.product_id})`);
        });
        
        // Delete wishlist items
        console.log('\n=== DELETING WISHLIST ITEMS ===');
        const deleteWishlistItems = await db.query('DELETE FROM wishlist_items');
        console.log(`✅ Deleted ${deleteWishlistItems.rowCount} wishlist items`);
      } else {
        console.log('No wishlist items found referencing products');
      }
      
      // Now delete all products (since these are all test/mock products)
      console.log('\n=== DELETING ALL PRODUCTS ===');
      const deleteResult = await db.query('DELETE FROM products');
      console.log(`✅ Deleted ${deleteResult.rowCount} products from database`);
      
    } else {
      console.log('No products found in database');
    }
    
    // Verify cleanup
    console.log('\n=== VERIFICATION ===');
    const remainingProducts = await db.query('SELECT COUNT(*) as count FROM products');
    const remainingOrderItems = await db.query('SELECT COUNT(*) as count FROM order_items');
    const remainingCartItems = await db.query('SELECT COUNT(*) as count FROM cart_items');
    const remainingWishlistItems = await db.query('SELECT COUNT(*) as count FROM wishlist_items');
    
    console.log(`Products remaining: ${remainingProducts.rows[0].count}`);
    console.log(`Order items remaining: ${remainingOrderItems.rows[0].count}`);
    console.log(`Cart items remaining: ${remainingCartItems.rows[0].count}`);
    console.log(`Wishlist items remaining: ${remainingWishlistItems.rows[0].count}`);
    
    if (remainingProducts.rows[0].count === '0') {
      console.log('✅ All products and related data successfully removed from database!');
    }
    
    console.log('\n🏁 Safe database cleanup completed');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    console.error('Full error:', error);
  } finally {
    process.exit(0);
  }
}

safeCleanupProducts();