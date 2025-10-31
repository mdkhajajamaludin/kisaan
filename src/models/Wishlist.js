const db = require('../config/database');

class Wishlist {
  // Get user's wishlist items with product details
  static async getByUserId(userId) {
    const query = `
      SELECT 
        wi.id,
        wi.product_id,
        wi.created_at,
        p.name,
        p.price,
        p.original_price,
        p.images,
        p.stock_quantity,
        p.category_id,
        CASE 
          WHEN p.category_id = 1 THEN 'Fruits'
          WHEN p.category_id = 2 THEN 'Vegetables'
          WHEN p.category_id = 3 THEN 'Grains'
          WHEN p.category_id = 4 THEN 'Desi Chicken'
          WHEN p.category_id = 5 THEN 'Rice'
          WHEN p.category_id = 6 THEN 'Honey'
          WHEN p.category_id = 7 THEN 'Dairy'
          WHEN p.category_id = 8 THEN 'Spices'
          WHEN p.category_id = 9 THEN 'Oils'
          WHEN p.category_id = 10 THEN 'Nuts & Seeds'
          ELSE 'Other'
        END as category_name,
        p.is_active
      FROM wishlist_items wi
      JOIN products p ON wi.product_id = p.id
      WHERE wi.user_id = $1 AND p.is_active = true
      ORDER BY wi.created_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    
    // Parse images for each item
    return result.rows.map(item => ({
      ...item,
      images: typeof item.images === 'string' ? JSON.parse(item.images) : (item.images || [])
    }));
  }

  // Add item to wishlist
  static async addItem(userId, productId) {
    const query = `
      INSERT INTO wishlist_items (user_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, product_id) DO NOTHING
      RETURNING *
    `;
    
    const result = await db.query(query, [userId, productId]);
    return result.rows[0];
  }

  // Remove item from wishlist
  static async removeItem(wishlistItemId, userId) {
    const query = `
      DELETE FROM wishlist_items 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [wishlistItemId, userId]);
    return result.rows[0];
  }

  // Remove by product ID
  static async removeByProductId(userId, productId) {
    const query = `
      DELETE FROM wishlist_items 
      WHERE user_id = $1 AND product_id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [userId, productId]);
    return result.rows[0];
  }

  // Check if item is in wishlist
  static async isInWishlist(userId, productId) {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM wishlist_items 
        WHERE user_id = $1 AND product_id = $2
      ) as exists
    `;
    
    const result = await db.query(query, [userId, productId]);
    return result.rows[0].exists;
  }

  // Get wishlist count
  static async getWishlistCount(userId) {
    const query = `
      SELECT COUNT(*) as count
      FROM wishlist_items
      WHERE user_id = $1
    `;
    
    const result = await db.query(query, [userId]);
    return parseInt(result.rows[0].count);
  }
}

module.exports = Wishlist;
