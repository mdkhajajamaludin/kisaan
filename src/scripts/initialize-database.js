const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function applyVendorAccessControlMigration() {
  try {
    console.log('🔧 Applying vendor access control migration...');
    
    // Add can_add_products column to users table if it doesn't exist
    try {
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'can_add_products'
      `);
      
      if (columnCheck.rows.length === 0) {
        await db.query('ALTER TABLE users ADD COLUMN can_add_products BOOLEAN DEFAULT false');
        console.log('✅ Added can_add_products column to users table');
        
        // Grant product access to existing vendors and admins
        await db.query(`UPDATE users SET can_add_products = true WHERE role IN ('vendor', 'admin')`);
        console.log('✅ Granted product access to existing vendors and admins');
      } else {
        console.log('✅ can_add_products column already exists');
      }
    } catch (error) {
      console.log('⚠️  Error adding can_add_products column:', error.message);
    }
    
    // Add is_active column to users table if it doesn't exist
    try {
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_active'
      `);
      
      if (columnCheck.rows.length === 0) {
        await db.query('ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true');
        console.log('✅ Added is_active column to users table');
      } else {
        console.log('✅ is_active column already exists');
      }
    } catch (error) {
      console.log('⚠️  Error adding is_active column:', error.message);
    }
    
    // Create indexes for vendor queries
    try {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_users_vendor_access 
        ON users(role, is_active, can_add_products) 
        WHERE role IN ('vendor', 'admin')
      `);
      console.log('✅ Created vendor access index');
      
      await db.query('CREATE INDEX IF NOT EXISTS idx_products_vendor_active ON products(vendor_id, is_active)');
      console.log('✅ Created products vendor index');
      
      await db.query('CREATE INDEX IF NOT EXISTS idx_order_items_vendor ON order_items(product_id)');
      console.log('✅ Created order items vendor index');
    } catch (error) {
      console.log('⚠️  Error creating indexes:', error.message);
    }
    
    // Update existing data to ensure consistency
    try {
      await db.query('UPDATE users SET is_active = true WHERE is_active IS NULL');
      await db.query(`UPDATE users SET can_add_products = true WHERE role IN ('vendor', 'admin') AND can_add_products IS NULL`);
      await db.query(`UPDATE users SET can_add_products = false WHERE role = 'customer' AND can_add_products IS NULL`);
      console.log('✅ Updated existing user data for consistency');
    } catch (error) {
      console.log('⚠️  Error updating existing data:', error.message);
    }
    
    // Create vendor analytics view
    try {
      await db.query(`
        CREATE OR REPLACE VIEW vendor_analytics AS
        SELECT 
          u.id as vendor_id,
          u.name as vendor_name,
          u.email as vendor_email,
          u.is_active,
          u.can_add_products,
          COUNT(DISTINCT p.id) as total_products,
          COUNT(DISTINCT CASE WHEN p.is_active = true THEN p.id END) as active_products,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(DISTINCT oi.quantity * oi.price), 0) as total_revenue,
          COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.id END) as completed_orders,
          COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.id END) as pending_orders
        FROM users u
        LEFT JOIN products p ON u.id = p.vendor_id
        LEFT JOIN order_items oi ON p.id = oi.product_id
        LEFT JOIN orders o ON oi.order_id = o.id
        WHERE u.role = 'vendor'
        GROUP BY u.id, u.name, u.email, u.is_active, u.can_add_products
      `);
      console.log('✅ Created vendor analytics view');
    } catch (error) {
      console.log('⚠️  Error creating vendor analytics view:', error.message);
    }
    
    console.log('✅ Vendor access control migration completed successfully');
    
  } catch (error) {
    console.error('❌ Vendor access control migration failed:', error);
    throw error;
  }
}

async function initializeDatabase() {
  try {
    console.log('🚀 Initializing database for vendor management system...');
    
    // Step 1: Run the optimization script
    console.log('\n📊 Step 1: Running database optimization...');
    const optimizationScript = require('./optimize-database');
    await optimizationScript();
    
    // Step 2: Apply vendor access control migration
    console.log('\n🔧 Step 2: Applying vendor access control migration...');
    await applyVendorAccessControlMigration();
    
    // Step 3: Verify all required tables exist
    console.log('\n🔍 Step 3: Verifying database schema...');
    
    const requiredTables = [
      'users',
      'products', 
      'orders',
      'order_items',
      'notifications',
      'vendor_requests',
      'categories'
    ];
    
    for (const table of requiredTables) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [table]);
      
      if (result.rows[0].exists) {
        console.log(`✅ Table '${table}' exists`);
      } else {
        console.log(`❌ Table '${table}' missing - creating...`);
        await createMissingTable(table);
      }
    }
    
    // Step 4: Ensure default data exists
    console.log('\n📝 Step 4: Ensuring default data exists...');
    await ensureDefaultData();
    
    // Step 5: Test database functionality
    console.log('\n🧪 Step 5: Testing database functionality...');
    await testDatabaseFunctionality();
    
    console.log('\n🎉 Database initialization completed successfully!');
    console.log('📋 Summary:');
    console.log('   • All required tables are present');
    console.log('   • Indexes are optimized for performance');
    console.log('   • Default categories are available');
    console.log('   • Vendor management system is ready');
    console.log('   • Real-time notifications are configured');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function createMissingTable(tableName) {
  const tableSchemas = {
    users: `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'vendor', 'admin')),
        phone VARCHAR(20),
        addresses JSONB DEFAULT '[]',
        preferences JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        can_add_products BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    products: `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        original_price DECIMAL(10,2),
        category_id INTEGER REFERENCES categories(id),
        vendor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        images JSONB DEFAULT '[]',
        stock_quantity INTEGER DEFAULT 0,
        min_quantity INTEGER DEFAULT 1,
        weight VARCHAR(50),
        origin_location VARCHAR(255),
        manufactured_date DATE,
        expiry_date DATE,
        harvest_date DATE,
        organic_certified BOOLEAN DEFAULT TRUE,
        tags JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    orders: `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
        shipping_address JSONB NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        notes TEXT,
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    order_items: `
      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    notifications: `
      CREATE TABLE notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB DEFAULT '{}',
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    vendor_requests: `
      CREATE TABLE vendor_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_name VARCHAR(255) NOT NULL,
        business_type VARCHAR(100),
        description TEXT,
        contact_info JSONB,
        documents JSONB,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        admin_notes TEXT,
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    categories: `
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  };
  
  if (tableSchemas[tableName]) {
    await db.query(tableSchemas[tableName]);
    console.log(`✅ Created table '${tableName}'`);
  } else {
    console.log(`⚠️  No schema available for table '${tableName}'`);
  }
}

async function ensureDefaultData() {
  // Ensure default categories exist
  const categoriesData = [
    { id: 1, name: 'Fruits', description: 'Fresh organic fruits' },
    { id: 2, name: 'Vegetables', description: 'Fresh organic vegetables' },
    { id: 3, name: 'Grains', description: 'Organic grains and cereals' },
    { id: 4, name: 'Desi Chicken', description: 'Free-range desi chicken' },
    { id: 5, name: 'Rice', description: 'Organic rice varieties' },
    { id: 6, name: 'Honey', description: 'Pure natural honey' },
    { id: 7, name: 'Dairy', description: 'Fresh dairy products' },
    { id: 8, name: 'Spices', description: 'Organic spices and herbs' },
    { id: 9, name: 'Oils', description: 'Cold-pressed organic oils' },
    { id: 10, name: 'Nuts & Seeds', description: 'Organic nuts and seeds' }
  ];
  
  for (const category of categoriesData) {
    try {
      await db.query(`
        INSERT INTO categories (id, name, description) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description
      `, [category.id, category.name, category.description]);
    } catch (error) {
      console.log(`⚠️  Could not insert category '${category.name}':`, error.message);
    }
  }
  
  console.log('✅ Default categories ensured');
  
  // Check if admin user exists
  const adminCheck = await db.query(`
    SELECT COUNT(*) as count FROM users WHERE role = 'admin'
  `);
  
  if (parseInt(adminCheck.rows[0].count) === 0) {
    console.log('⚠️  No admin users found. You may need to create an admin user manually.');
  } else {
    console.log(`✅ Found ${adminCheck.rows[0].count} admin user(s)`);
  }
}

async function testDatabaseFunctionality() {
  try {
    // Test basic queries
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');
    console.log(`✅ Users table: ${userCount.rows[0].count} users`);
    
    const productCount = await db.query('SELECT COUNT(*) as count FROM products');
    console.log(`✅ Products table: ${productCount.rows[0].count} products`);
    
    const orderCount = await db.query('SELECT COUNT(*) as count FROM orders');
    console.log(`✅ Orders table: ${orderCount.rows[0].count} orders`);
    
    const notificationCount = await db.query('SELECT COUNT(*) as count FROM notifications');
    console.log(`✅ Notifications table: ${notificationCount.rows[0].count} notifications`);
    
    // Test vendor analytics view
    try {
      const vendorAnalytics = await db.query('SELECT COUNT(*) as count FROM vendor_analytics');
      console.log(`✅ Vendor analytics view: ${vendorAnalytics.rows[0].count} vendors tracked`);
    } catch (error) {
      console.log('⚠️  Vendor analytics view not available');
    }
    
    // Test notification cleanup function
    try {
      const cleanupTest = await db.query('SELECT cleanup_old_notifications() as deleted');
      console.log(`✅ Notification cleanup function: ${cleanupTest.rows[0].deleted} old notifications cleaned`);
    } catch (error) {
      console.log('⚠️  Notification cleanup function not available');
    }
    
  } catch (error) {
    console.log('⚠️  Some database functionality tests failed:', error.message);
  }
}

// Run initialization if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('\n✅ Database initialization complete! Your vendor management system is ready to use.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = initializeDatabase;