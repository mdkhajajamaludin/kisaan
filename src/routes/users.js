const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireOwnershipOrAdmin } = require('../middleware/roles');
const Joi = require('joi');

// Validation schemas
const addToCartSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().positive().required()
});

const updateCartSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required()
});

const addToWishlistSchema = Joi.object({
  product_id: Joi.number().integer().positive().required()
});

// Helper function to get cart/wishlist user ID
const getResourceUserId = async (req) => {
  // For cart and wishlist operations, the user ID is always the authenticated user
  return req.user.id;
};

// Get user cart
router.get('/cart', verifyToken, async (req, res) => {
  try {
    const userId = await getResourceUserId(req);
    
    const query = `
      SELECT ci.id, ci.quantity, ci.created_at,
             p.id as product_id, p.name, p.price, p.images, p.stock_quantity,
             u.name as vendor_name
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      JOIN users u ON p.vendor_id = u.id
      WHERE ci.user_id = $1 AND p.is_active = true
      ORDER BY ci.created_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    
    res.json({
      success: true,
      cart: result.rows
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
router.post('/cart', verifyToken, async (req, res) => {
  try {
    const { error, value } = addToCartSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const userId = await getResourceUserId(req);
    const { product_id, quantity } = value;

    // Check if product exists and is active
    const productQuery = 'SELECT id, stock_quantity FROM products WHERE id = $1 AND is_active = true';
    const productResult = await db.query(productQuery, [product_id]);
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or inactive' });
    }

    const product = productResult.rows[0];
    if (quantity > product.stock_quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    // Check if item already in cart
    const existingQuery = 'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2';
    const existingResult = await db.query(existingQuery, [userId, product_id]);

    if (existingResult.rows.length > 0) {
      // Update existing cart item
      const newQuantity = existingResult.rows[0].quantity + quantity;
      if (newQuantity > product.stock_quantity) {
        return res.status(400).json({ error: 'Total quantity exceeds stock' });
      }

      const updateQuery = `
        UPDATE cart_items 
        SET quantity = $3, created_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND product_id = $2
        RETURNING *
      `;
      await db.query(updateQuery, [userId, product_id, newQuantity]);
    } else {
      // Add new cart item
      const insertQuery = `
        INSERT INTO cart_items (user_id, product_id, quantity)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      await db.query(insertQuery, [userId, product_id, quantity]);
    }

    res.json({
      success: true,
      message: 'Item added to cart successfully'
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cart item quantity
router.put('/cart/:itemId', verifyToken, async (req, res) => {
  try {
    const { error, value } = updateCartSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const userId = await getResourceUserId(req);
    const { itemId } = req.params;
    const { quantity } = value;

    if (quantity === 0) {
      // Remove item from cart
      const deleteQuery = 'DELETE FROM cart_items WHERE id = $1 AND user_id = $2';
      await db.query(deleteQuery, [itemId, userId]);
    } else {
      // Update quantity
      const updateQuery = `
        UPDATE cart_items 
        SET quantity = $3
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;
      const result = await db.query(updateQuery, [itemId, userId, quantity]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Cart item not found' });
      }
    }

    res.json({
      success: true,
      message: 'Cart updated successfully'
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/cart/:itemId', verifyToken, async (req, res) => {
  try {
    const userId = await getResourceUserId(req);
    const { itemId } = req.params;

    const deleteQuery = 'DELETE FROM cart_items WHERE id = $1 AND user_id = $2';
    const result = await db.query(deleteQuery, [itemId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({
      success: true,
      message: 'Item removed from cart successfully'
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear entire cart
router.delete('/cart', verifyToken, async (req, res) => {
  try {
    const userId = await getResourceUserId(req);

    const deleteQuery = 'DELETE FROM cart_items WHERE user_id = $1';
    await db.query(deleteQuery, [userId]);

    res.json({
      success: true,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user wishlist
router.get('/wishlist', verifyToken, async (req, res) => {
  try {
    const userId = await getResourceUserId(req);
    
    const query = `
      SELECT wi.id, wi.created_at,
             p.id as product_id, p.name, p.price, p.images, p.stock_quantity,
             u.name as vendor_name
      FROM wishlist_items wi
      JOIN products p ON wi.product_id = p.id
      JOIN users u ON p.vendor_id = u.id
      WHERE wi.user_id = $1 AND p.is_active = true
      ORDER BY wi.created_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    
    res.json({
      success: true,
      wishlist: result.rows
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to wishlist
router.post('/wishlist', verifyToken, async (req, res) => {
  try {
    const { error, value } = addToWishlistSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const userId = await getResourceUserId(req);
    const { product_id } = value;

    // Check if product exists and is active
    const productQuery = 'SELECT id FROM products WHERE id = $1 AND is_active = true';
    const productResult = await db.query(productQuery, [product_id]);
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or inactive' });
    }

    // Add to wishlist (ignore if already exists)
    const insertQuery = `
      INSERT INTO wishlist_items (user_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, product_id) DO NOTHING
      RETURNING *
    `;
    await db.query(insertQuery, [userId, product_id]);

    res.json({
      success: true,
      message: 'Item added to wishlist successfully'
    });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from wishlist
router.delete('/wishlist/:itemId', verifyToken, async (req, res) => {
  try {
    const userId = await getResourceUserId(req);
    const { itemId } = req.params;

    const deleteQuery = 'DELETE FROM wishlist_items WHERE id = $1 AND user_id = $2';
    const result = await db.query(deleteQuery, [itemId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }

    res.json({
      success: true,
      message: 'Item removed from wishlist successfully'
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
