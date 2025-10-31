const db = require('../config/database');

// Middleware to check if user has vendor access and is active
const requireActiveVendor = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user is an active vendor with product access
    if (req.user.role !== 'vendor') {
      return res.status(403).json({ 
        error: 'Vendor access required',
        message: 'You need to be an approved vendor to access this resource'
      });
    }

    if (!req.user.is_active) {
      return res.status(403).json({ 
        error: 'Account disabled',
        message: 'Your vendor account has been disabled. Please contact support.'
      });
    }

    if (!req.user.can_add_products) {
      return res.status(403).json({ 
        error: 'Product access denied',
        message: 'You do not have permission to manage products. Please contact support.'
      });
    }

    next();
  } catch (error) {
    console.error('Vendor access check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to ensure vendors can only access their own data
const requireVendorDataIsolation = (getResourceVendorId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admin can access all data
      if (req.user.role === 'admin') {
        return next();
      }

      // Must be an active vendor
      if (req.user.role !== 'vendor' || !req.user.is_active || !req.user.can_add_products) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to access this resource'
        });
      }

      // Get the vendor ID associated with the resource
      const resourceVendorId = await getResourceVendorId(req);

      // Ensure vendor can only access their own data
      if (req.user.id !== resourceVendorId) {
        return res.status(403).json({ 
          error: 'Data isolation violation',
          message: 'You can only access your own data'
        });
      }

      next();
    } catch (error) {
      console.error('Vendor data isolation check error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Middleware to check if user can add products
const requireProductAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin can always add products
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user has product access permission
    if (!req.user.can_add_products) {
      return res.status(403).json({ 
        error: 'Product access denied',
        message: 'You do not have permission to add or manage products. Please contact support to request access.'
      });
    }

    // If user is a vendor, ensure they are active
    if (req.user.role === 'vendor' && !req.user.is_active) {
      return res.status(403).json({ 
        error: 'Account disabled',
        message: 'Your vendor account has been disabled. Please contact support.'
      });
    }

    next();
  } catch (error) {
    console.error('Product access check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function to get order vendor ID
const getOrderVendorId = async (req) => {
  const orderId = req.params.id || req.params.orderId;
  
  const query = `
    SELECT DISTINCT p.vendor_id
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN products p ON oi.product_id = p.id
    WHERE o.id = $1
    LIMIT 1
  `;
  
  const result = await db.query(query, [orderId]);
  return result.rows.length > 0 ? result.rows[0].vendor_id : null;
};

// Helper function to get product vendor ID
const getProductVendorId = async (req) => {
  const productId = req.params.id || req.params.productId;
  
  const query = 'SELECT vendor_id FROM products WHERE id = $1';
  const result = await db.query(query, [productId]);
  
  return result.rows.length > 0 ? result.rows[0].vendor_id : null;
};

// Middleware to ensure vendors only see orders containing their products
const requireVendorOrderAccess = requireVendorDataIsolation(getOrderVendorId);

// Middleware to ensure vendors only manage their own products
const requireVendorProductAccess = requireVendorDataIsolation(getProductVendorId);

module.exports = {
  requireActiveVendor,
  requireVendorDataIsolation,
  requireProductAccess,
  requireVendorOrderAccess,
  requireVendorProductAccess,
  getOrderVendorId,
  getProductVendorId
};