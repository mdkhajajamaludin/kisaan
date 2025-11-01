const ProductSubmission = require('../models/ProductSubmission');

/**
 * Middleware to check if user has product creation access
 * Users must have an approved product submission to create products
 */
const requireProductAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin always has access - no further checks needed
    if (req.user.role === 'admin') {
      console.log('Admin user detected - granting full product access');
      req.productAccess = {
        is_approved: true,
        max_products: 999999,
        current_product_count: 0,
        remaining_slots: 999999
      };
      return next();
    }

    // Check if user has product access
    const access = await ProductSubmission.hasProductAccess(req.user.id);

    if (!access) {
      return res.status(403).json({
        error: 'Product creation access required',
        message: 'You need to request and receive approval for product creation access before you can add products.',
        action: 'submit_request',
        redirect: '/product-access'
      });
    }

    // Check if access is still valid (not revoked)
    if (access.revoked_at) {
      return res.status(403).json({
        error: 'Product access has been revoked',
        message: 'Your product creation access has been revoked. Please contact support.',
        revoked_at: access.revoked_at
      });
    }

    // Get user's current product count
    const db = require('../config/database');
    const productCountResult = await db.query(
      'SELECT COUNT(*) as count FROM products WHERE vendor_id = $1 AND is_active = true',
      [req.user.id]
    );
    const currentProductCount = parseInt(productCountResult.rows[0].count);

    // Check if user has reached their product limit
    if (currentProductCount >= access.max_products) {
      return res.status(403).json({
        error: 'Product limit reached',
        message: `You have reached your maximum product limit of ${access.max_products}. Please contact support to increase your limit.`,
        current_count: currentProductCount,
        max_products: access.max_products
      });
    }

    // Attach access info to request for use in route handlers
    req.productAccess = {
      ...access,
      current_product_count: currentProductCount,
      remaining_slots: access.max_products - currentProductCount
    };

    next();
  } catch (error) {
    console.error('Product access check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to check if user can edit a specific product
 * Users can only edit their own products
 */
const requireProductOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin can edit any product
    if (req.user.role === 'admin') {
      console.log('Admin user detected - granting product edit access');
      return next();
    }

    const productId = req.params.id;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    // Check if product belongs to user
    const db = require('../config/database');
    const result = await db.query(
      'SELECT vendor_id FROM products WHERE id = $1',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    if (product.vendor_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own products'
      });
    }

    next();
  } catch (error) {
    console.error('Product ownership check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  requireProductAccess,
  requireProductOwnership
};

