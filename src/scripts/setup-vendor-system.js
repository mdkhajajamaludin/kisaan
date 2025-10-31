const db = require('../config/database');

async function setupVendorSystem() {
  try {
    console.log('🚀 Setting up multi-vendor e-commerce system...');
    
    // Step 1: Ensure all required tables exist
    console.log('\n📋 Step 1: Creating required tables...');
    
    // Create categories table first (referenced by products)
    await db.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Categories table ready');
    
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'vendor', 'admin')),
        phone VARCHAR(20),
        addresses JSONB DEFAULT '[]',
        preferences JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Users table ready');
    
    // Create products table with vendor reference
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
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
    `);
    console.log('✅ Products table ready');
    
    // Create orders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
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
    `);
    console.log('✅ Orders table ready');
    
    // Create order_items table (links orders to products and vendors)
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Order items table ready');
    
    // Create notifications table for real-time alerts
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
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
    `);
    console.log('✅ Notifications table ready');
    
    // Create vendor_requests table for vendor approval system
    await db.query(`
      CREATE TABLE IF NOT EXISTS vendor_requests (
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
    `);
    console.log('✅ Vendor requests table ready');
    
    // Step 2: Create essential indexes for performance
    console.log('\n🔗 Step 2: Creating performance indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)',
      'CREATE INDEX IF NOT EXISTS idx_products_vendor_active ON products(vendor_id, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read = FALSE',
      'CREATE INDEX IF NOT EXISTS idx_vendor_requests_status ON vendor_requests(status)'
    ];
    
    for (const indexQuery of indexes) {
      await db.query(indexQuery);
    }
    console.log('✅ Performance indexes created');
    
    // Step 3: Insert default categories
    console.log('\n📝 Step 3: Setting up default categories...');
    
    const categories = [
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
    
    for (const category of categories) {
      await db.query(`
        INSERT INTO categories (id, name, description) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description
      `, [category.id, category.name, category.description]);
    }
    console.log('✅ Default categories inserted');
    
    // Step 4: Create vendor analytics view
    console.log('\n📊 Step 4: Creating vendor analytics view...');
    
    await db.query(`
      CREATE OR REPLACE VIEW vendor_analytics AS
      SELECT 
        u.id as vendor_id,
        u.name as vendor_name,
        u.email as vendor_email,
        u.is_active as vendor_active,
        COUNT(DISTINCT p.id) as total_products,
        COUNT(DISTINCT CASE WHEN p.is_active = TRUE THEN p.id END) as active_products,
        COUNT(DISTINCT CASE WHEN p.stock_quantity = 0 THEN p.id END) as out_of_stock_products,
        COUNT(DISTINCT CASE WHEN p.stock_quantity <= 5 AND p.stock_quantity > 0 THEN p.id END) as low_stock_products,
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.id END) as completed_orders,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) as avg_order_value
      FROM users u
      LEFT JOIN products p ON u.id = p.vendor_id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE u.role = 'vendor'
      GROUP BY u.id, u.name, u.email, u.is_active;
    `);
    console.log('✅ Vendor analytics view created');
    
    // Step 5: Create automatic timestamp update function
    console.log('\n⏰ Step 5: Setting up automatic timestamps...');
    
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    const tables = ['users', 'products', 'orders', 'notifications', 'vendor_requests'];
    for (const table of tables) {
      await db.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at 
        BEFORE UPDATE ON ${table} 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);
    }
    console.log('✅ Automatic timestamps configured');
    
    // Step 6: Test the setup
    console.log('\n🧪 Step 6: Testing the setup...');
    
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');
    const productCount = await db.query('SELECT COUNT(*) as count FROM products');
    const orderCount = await db.query('SELECT COUNT(*) as count FROM orders');
    const categoryCount = await db.query('SELECT COUNT(*) as count FROM categories');
    
    console.log(`✅ Database ready with:`);
    console.log(`   • ${userCount.rows[0].count} users`);
    console.log(`   • ${productCount.rows[0].count} products`);
    console.log(`   • ${orderCount.rows[0].count} orders`);
    console.log(`   • ${categoryCount.rows[0].count} categories`);
    
    console.log('\n🎉 Multi-vendor e-commerce system setup completed successfully!');
    console.log('📋 System features:');
    console.log('   ✅ Vendor-linked product management');
    console.log('   ✅ Automatic order-to-vendor mapping');
    console.log('   ✅ Real-time notification system');
    console.log('   ✅ Vendor dashboard with own data only');
    console.log('   ✅ Admin panel with full visibility');
    console.log('   ✅ Performance-optimized database');
    
  } catch (error) {
    console.error('❌ Vendor system setup failed:', error);
    throw error;
  }
}

// Run setup if called directly
if (require.main === module) {
  setupVendorSystem()
    .then(() => {
      console.log('\n✅ Setup complete! Your multi-vendor system is ready.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupVendorSystem;