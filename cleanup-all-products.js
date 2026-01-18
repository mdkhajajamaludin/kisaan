// Direct database cleanup to remove all mock/test products
const db = require('./src/config/database');

async function cleanupAllProducts() {
  try {
    console.log('🧹 Cleaning up all mock/test products from database...\n');
    
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
      
      // Delete all products (since these are all test/mock products)
      console.log('\n=== DELETING ALL PRODUCTS ===');
      const deleteResult = await db.query('DELETE FROM products');
      console.log(`✅ Deleted ${deleteResult.rowCount} products from database`);
      
    } else {
      console.log('No products found in database');
    }
    
    // Verify cleanup
    console.log('\n=== VERIFICATION ===');
    const remainingProducts = await db.query('SELECT COUNT(*) as count FROM products');
    console.log(`Products remaining: ${remainingProducts.rows[0].count}`);
    
    if (remainingProducts.rows[0].count === '0') {
      console.log('✅ All products successfully removed from database!');
    }
    
    console.log('\n🏁 Database cleanup completed');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    console.error('Full error:', error);
  } finally {
    process.exit(0);
  }
}

cleanupAllProducts();