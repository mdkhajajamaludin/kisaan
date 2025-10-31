const db = require('./database');

const addOrganicFields = async () => {
  try {
    console.log('Adding organic food fields to products table...');
    
    // Add new columns for organic food
    await db.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS min_quantity INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS weight VARCHAR(50),
      ADD COLUMN IF NOT EXISTS origin_location VARCHAR(200),
      ADD COLUMN IF NOT EXISTS manufactured_date DATE,
      ADD COLUMN IF NOT EXISTS expiry_date DATE,
      ADD COLUMN IF NOT EXISTS harvest_date DATE,
      ADD COLUMN IF NOT EXISTS organic_certified BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'
    `);
    
    console.log('Organic food fields added successfully!');
    
    // Update categories for organic food
    console.log('Updating categories...');
    
    // Update existing categories to organic food categories
    const categories = [
      { id: 1, name: 'Fruits', description: 'Fresh organic fruits and seasonal produce' },
      { id: 2, name: 'Vegetables', description: 'Fresh organic vegetables and leafy greens' },
      { id: 3, name: 'Grains', description: 'Organic grains, cereals and pulses' },
      { id: 4, name: 'Desi Chicken', description: 'Free-range organic chicken and poultry' },
      { id: 5, name: 'Rice', description: 'Organic rice varieties and grain products' },
      { id: 6, name: 'Honey', description: 'Pure organic honey and bee products' }
    ];

    for (const category of categories) {
      await db.query(
        'UPDATE categories SET name = $2, description = $3 WHERE id = $1',
        [category.id, category.name, category.description]
      );
    }
    
    // Insert additional categories if they don't exist
    const additionalCategories = [
      { name: 'Dairy', description: 'Organic milk, cheese and dairy products' },
      { name: 'Spices', description: 'Organic spices and herbs' },
      { name: 'Oils', description: 'Cold-pressed organic oils' },
      { name: 'Nuts & Seeds', description: 'Organic nuts, seeds and dry fruits' }
    ];

    for (const category of additionalCategories) {
      await db.query(
        'INSERT INTO categories (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [category.name, category.description]
      );
    }
    
    console.log('Categories updated successfully!');
    console.log('Migration completed!');
    
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
};

// Run migration if called directly
if (require.main === module) {
  addOrganicFields()
    .then(() => {
      console.log('Organic fields migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addOrganicFields };