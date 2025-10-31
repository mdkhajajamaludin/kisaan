const db = require('../config/database');

async function fixCartColumns() {
  try {
    console.log('🔧 Fixing cart_items table columns...');

    // Check if columns exist
    const checkColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'cart_items' 
      AND column_name IN ('selected_color', 'selected_storage')
    `);

    console.log('Existing columns:', checkColumns.rows);

    if (checkColumns.rows.length === 0) {
      console.log('Adding missing columns to cart_items table...');
      
      await db.query(`
        ALTER TABLE cart_items 
        ADD COLUMN IF NOT EXISTS selected_color VARCHAR(100),
        ADD COLUMN IF NOT EXISTS selected_storage VARCHAR(100);
      `);

      console.log('✅ Columns added successfully!');

      // Drop existing unique constraint if it exists
      try {
        await db.query(`
          ALTER TABLE cart_items 
          DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_key;
        `);
        console.log('✅ Dropped old unique constraint');
      } catch (err) {
        console.log('No old constraint to drop');
      }

      // Add new unique constraint with all fields
      await db.query(`
        ALTER TABLE cart_items 
        ADD CONSTRAINT cart_items_unique_item 
        UNIQUE(user_id, product_id, selected_color, selected_storage);
      `);

      console.log('✅ New unique constraint added!');
    } else {
      console.log('✅ Columns already exist!');
    }

    // Verify final structure
    const finalCheck = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cart_items' 
      ORDER BY ordinal_position
    `);

    console.log('\n📊 Final cart_items table structure:');
    finalCheck.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n🎉 Cart table fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing cart table:', error);
    process.exit(1);
  }
}

fixCartColumns();
