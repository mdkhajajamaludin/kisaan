const db = require('./database');

const categories = [
  { 
    name: 'Fruits', 
    description: 'Fresh organic fruits',
    image_url: 'https://i.postimg.cc/T17d1q4M/8565552.webp' 
  },
  { 
    name: 'Vegetables', 
    description: 'Fresh organic vegetables',
    image_url: 'https://i.postimg.cc/Dzn54Xm3/veg.webp' 
  },
  { 
    name: 'Grains', 
    description: 'Organic grains and cereals',
    image_url: 'https://i.postimg.cc/tCnBKbLG/image.webp' 
  },
  { 
    name: 'Desi Chicken', 
    description: 'Free-range organic chicken',
    image_url: 'https://i.postimg.cc/QNw29f3P/11597734.webp' 
  },
  { 
    name: 'Rice', 
    description: 'Organic rice varieties',
    image_url: 'https://i.postimg.cc/zvK0RSw8/12182198.webp' 
  },
  { 
    name: 'Honey', 
    description: 'Pure organic honey',
    image_url: 'https://i.postimg.cc/T2g900mG/honey.webp' 
  },
  { 
    name: 'Dairy', 
    description: 'Organic dairy products',
    image_url: null 
  },
  { 
    name: 'Spices', 
    description: 'Organic spices and herbs',
    image_url: null 
  },
  { 
    name: 'Oils', 
    description: 'Cold-pressed organic oils',
    image_url: null 
  },
  { 
    name: 'Nuts & Seeds', 
    description: 'Organic nuts and seeds',
    image_url: null 
  }
];

async function seedCategories() {
  try {
    console.log('Seeding categories...');
    
    for (const category of categories) {
      const query = `
        INSERT INTO categories (name, description, image_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          image_url = EXCLUDED.image_url
      `;
      
      await db.query(query, [category.name, category.description, category.image_url]);
      console.log(`✓ Seeded category: ${category.name}`);
    }
    
    console.log('Categories seeded successfully!');
  } catch (error) {
    console.error('Error seeding categories:', error);
  }
}

// Run if called directly
if (require.main === module) {
  seedCategories().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}

module.exports = { seedCategories };