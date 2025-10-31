const db = require('./src/config/database');

async function checkUserAccess() {
  try {
    console.log('Checking user access for user ID 33...\n');
    
    // Check product submissions
    const submissions = await db.query(`
      SELECT * FROM product_submission_requests WHERE user_id = 33 ORDER BY created_at DESC
    `);
    
    console.log('Product Submissions:');
    console.log(submissions.rows);
    console.log('\n');
    
    // Check product access
    const access = await db.query(`
      SELECT * FROM user_product_access WHERE user_id = 33
    `);
    
    console.log('User Product Access:');
    console.log(access.rows);
    console.log('\n');
    
    // Check products
    const products = await db.query(`
      SELECT COUNT(*) as count FROM products WHERE vendor_id = 33
    `);
    
    console.log('Product Count:');
    console.log(products.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserAccess();

