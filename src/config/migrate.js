const db = require('./database');

const createTables = async () => {
  try {
    // Users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer',
        phone VARCHAR(20),
        addresses JSONB DEFAULT '[]',
        preferences JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Categories table
    await db.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Products table
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        original_price DECIMAL(10,2),
        category_id INTEGER REFERENCES categories(id),
        vendor_id INTEGER REFERENCES users(id),
        images JSONB DEFAULT '[]',
        stock_quantity INTEGER DEFAULT 0,
        min_quantity INTEGER DEFAULT 1,
        colors JSONB DEFAULT '[]',
        sizes JSONB DEFAULT '[]',
        weight VARCHAR(50),
        dimensions VARCHAR(100),
        brand VARCHAR(100),
        sku VARCHAR(100),
        tags JSONB DEFAULT '[]',
        manufactured_date DATE,
        expiry_date DATE,
        harvest_date DATE,
        organic_certified BOOLEAN DEFAULT true,
        origin_location VARCHAR(200),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Orders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        shipping_address JSONB NOT NULL,
        payment_method VARCHAR(100),
        notes TEXT,
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Order items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Vendor requests table
    await db.query(`
      CREATE TABLE IF NOT EXISTS vendor_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        business_name VARCHAR(255) NOT NULL,
        business_type VARCHAR(100),
        description TEXT,
        contact_info JSONB,
        documents JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Cart items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Wishlist items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        product_id INTEGER REFERENCES products(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Notifications table
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB DEFAULT '{}',
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP
      )
    `);

    // Email notifications table
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_notifications (
        id SERIAL PRIMARY KEY,
        recipient_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        template_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chat Sessions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Messages table
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
        sender_type VARCHAR(50) NOT NULL,
        sender_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await db.query('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)');

    // Insert default categories for organic food
    const categories = [
      { name: 'Fruits', description: 'Fresh organic fruits and seasonal produce' },
      { name: 'Vegetables', description: 'Fresh organic vegetables and leafy greens' },
      { name: 'Grains', description: 'Organic grains, cereals and pulses' },
      { name: 'Desi Chicken', description: 'Free-range organic chicken and poultry' },
      { name: 'Rice', description: 'Organic rice varieties and grain products' },
      { name: 'Honey', description: 'Pure organic honey and bee products' },
      { name: 'Dairy', description: 'Organic milk, cheese and dairy products' },
      { name: 'Spices', description: 'Organic spices and herbs' },
      { name: 'Oils', description: 'Cold-pressed organic oils' },
      { name: 'Nuts & Seeds', description: 'Organic nuts, seeds and dry fruits' }
    ];

    for (const category of categories) {
      await db.query(
        'INSERT INTO categories (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [category.name, category.description]
      );
    }

    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
};

// Run migration if called directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables };