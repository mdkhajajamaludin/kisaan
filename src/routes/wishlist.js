const express = require('express');
const router = express.Router();
const Wishlist = require('../models/Wishlist');
const { verifyToken } = require('../middleware/auth');

// Get user's wishlist
router.get('/', verifyToken, async (req, res) => {
  try {
    const wishlistItems = await Wishlist.getByUserId(req.user.id);
    const count = await Wishlist.getWishlistCount(req.user.id);
    
    res.json({
      success: true,
      wishlist: wishlistItems,
      count
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to wishlist
router.post('/add', verifyToken, async (req, res) => {
  try {
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    await Wishlist.addItem(req.user.id, product_id);
    const updatedWishlist = await Wishlist.getByUserId(req.user.id);
    const count = await Wishlist.getWishlistCount(req.user.id);

    res.json({
      success: true,
      message: 'Item added to wishlist',
      wishlist: updatedWishlist,
      count
    });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from wishlist
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const wishlistItemId = parseInt(req.params.id);

    if (isNaN(wishlistItemId)) {
      return res.status(400).json({ error: 'Invalid wishlist item ID' });
    }

    await Wishlist.removeItem(wishlistItemId, req.user.id);
    const updatedWishlist = await Wishlist.getByUserId(req.user.id);
    const count = await Wishlist.getWishlistCount(req.user.id);

    res.json({
      success: true,
      message: 'Item removed from wishlist',
      wishlist: updatedWishlist,
      count
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove by product ID
router.delete('/product/:productId', verifyToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    await Wishlist.removeByProductId(req.user.id, productId);
    const updatedWishlist = await Wishlist.getByUserId(req.user.id);
    const count = await Wishlist.getWishlistCount(req.user.id);

    res.json({
      success: true,
      message: 'Item removed from wishlist',
      wishlist: updatedWishlist,
      count
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if product is in wishlist
router.get('/check/:productId', verifyToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const inWishlist = await Wishlist.isInWishlist(req.user.id, productId);

    res.json({
      success: true,
      in_wishlist: inWishlist
    });
  } catch (error) {
    console.error('Check wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
