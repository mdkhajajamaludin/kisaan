const db = require('../config/database');

class Cart {
  // Get user's cart items with product details
  static async getByUserId(userId) {
    const query = `
      SELECT 
        ci.id,
        ci.product_id,
        ci.quantity,
        ci.selected_color,
        ci.selected_storage,
        ci.created_at,
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
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.user_id = $1 AND p.is_active = true
      ORDER BY ci.created_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    
    // Parse images for each item
    return result.rows.map(item => ({
      ...item,
      images: typeof item.images === 'string' ? JSON.parse(item.images) : (item.images || [])
    }));
  }

  // Add item to cart
  static async addItem(userId, productId, quantity = 1, selectedColor = null, selectedStorage = null) {
    const query = `
      INSERT INTO cart_items (user_id, product_id, quantity, selected_color, selected_storage)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, product_id, selected_color, selected_storage)
      DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await db.query(query, [userId, productId, quantity, selectedColor, selectedStorage]);
    return result.rows[0];
  }

  // Update cart item quantity
  static async updateQuantity(cartItemId, userId, quantity) {
    if (quantity <= 0) {
      return this.removeItem(cartItemId, userId);
    }

    const query = `
      UPDATE cart_items 
      SET quantity = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [cartItemId, userId, quantity]);
    return result.rows[0];
  }

  // Remove item from cart
  static async removeItem(cartItemId, userId) {
    const query = `
      DELETE FROM cart_items 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [cartItemId, userId]);
    return result.rows[0];
  }

  // Clear entire cart
  static async clearCart(userId) {
    const query = `
      DELETE FROM cart_items 
      WHERE user_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Get cart count
  static async getCartCount(userId) {
    const query = `
      SELECT COUNT(*) as count, COALESCE(SUM(quantity), 0) as total_items
      FROM cart_items
      WHERE user_id = $1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
}

module.exports = Cart;
