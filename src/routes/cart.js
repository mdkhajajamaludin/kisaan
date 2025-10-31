const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const { verifyToken } = require('../middleware/auth');

// Get user's cart
router.get('/', verifyToken, async (req, res) => {
  try {
    console.log('GET /api/cart - User ID:', req.user.id);
    
    // Check if cart_items table exists, if not return empty cart
    const cartItems = await Cart.getByUserId(req.user.id).catch(err => {
      console.error('Cart getByUserId error:', err);
      // If table doesn't exist, return empty cart
      if (err.message && err.message.includes('does not exist')) {
        return [];
      }
      throw err;
    });
    
    const count = await Cart.getCartCount(req.user.id).catch(err => {
      console.error('Cart getCartCount error:', err);
      return { count: '0', total_items: '0' };
    });
    
    res.json({
      success: true,
      cart: cartItems || [],
      count: parseInt(count.count || 0),
      total_items: parseInt(count.total_items || 0)
    });
  } catch (error) {
    console.error('Get cart error:', error);
    console.error('Error details:', error.message, error.stack);
    
    // Return empty cart instead of error to prevent frontend crashes
    res.json({
      success: true,
      cart: [],
      count: 0,
      total_items: 0
    });
  }
});

// Add item to cart
router.post('/add', verifyToken, async (req, res) => {
  try {
    console.log('POST /api/cart/add - User ID:', req.user.id);
    console.log('Request body:', req.body);
    
    const { product_id, quantity = 1, selected_color, selected_storage } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    console.log('Adding item to cart:', { userId: req.user.id, productId: product_id, quantity });
    
    const cartItem = await Cart.addItem(
      req.user.id,
      product_id,
      quantity,
      selected_color,
      selected_storage
    );

    console.log('Cart item added:', cartItem);

    const updatedCart = await Cart.getByUserId(req.user.id);
    const count = await Cart.getCartCount(req.user.id);

    res.json({
      success: true,
      message: 'Item added to cart',
      cart: updatedCart,
      count: parseInt(count.count),
      total_items: parseInt(count.total_items)
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// Update cart item quantity
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const cartItemId = parseInt(req.params.id);
    const { quantity } = req.body;

    if (isNaN(cartItemId) || !quantity) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    await Cart.updateQuantity(cartItemId, req.user.id, quantity);
    const updatedCart = await Cart.getByUserId(req.user.id);
    const count = await Cart.getCartCount(req.user.id);

    res.json({
      success: true,
      message: 'Cart updated',
      cart: updatedCart,
      count: parseInt(count.count),
      total_items: parseInt(count.total_items)
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const cartItemId = parseInt(req.params.id);

    if (isNaN(cartItemId)) {
      return res.status(400).json({ error: 'Invalid cart item ID' });
    }

    await Cart.removeItem(cartItemId, req.user.id);
    const updatedCart = await Cart.getByUserId(req.user.id);
    const count = await Cart.getCartCount(req.user.id);

    res.json({
      success: true,
      message: 'Item removed from cart',
      cart: updatedCart,
      count: parseInt(count.count),
      total_items: parseInt(count.total_items)
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear cart
router.delete('/', verifyToken, async (req, res) => {
  try {
    await Cart.clearCart(req.user.id);

    res.json({
      success: true,
      message: 'Cart cleared',
      cart: [],
      count: 0,
      total_items: 0
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
