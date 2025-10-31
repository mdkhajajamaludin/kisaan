const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: userRole
      });
    }
    
    next();
  };
};

// Simple admin check - only allow dev.unity.cc@gmail.com
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Simple admin check - only allow specific email
  if (req.user.email !== 'dev.unity.cc@gmail.com') {
    return res.status(403).json({ 
      error: 'Admin access denied',
      message: 'Only dev.unity.cc@gmail.com has admin access'
    });
  }
  
  next();
};
const requireVendor = requireRole(['admin', 'vendor']);
const requireCustomer = requireRole(['admin', 'vendor', 'customer']);

const checkAdminEmail = (req, res, next) => {
  // This middleware is now just a pass-through
  // Admin role is determined during registration or manually set
  next();
};

const requireOwnershipOrAdmin = (getResourceUserId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Admin can access everything
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Get the user ID associated with the resource
      const resourceUserId = await getResourceUserId(req);
      
      // Check if user owns the resource
      if (req.user.id !== resourceUserId) {
        return res.status(403).json({ error: 'Access denied: You can only access your own resources' });
      }
      
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

const requireVendorOwnership = (getProductVendorId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Admin can access everything
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Must be a vendor
      if (req.user.role !== 'vendor') {
        return res.status(403).json({ error: 'Vendor access required' });
      }
      
      // Get the vendor ID associated with the product
      const productVendorId = await getProductVendorId(req);
      
      // Check if vendor owns the product
      if (req.user.id !== productVendorId) {
        return res.status(403).json({ error: 'Access denied: You can only manage your own products' });
      }
      
      next();
    } catch (error) {
      console.error('Vendor ownership check error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = {
  requireRole,
  requireAdmin,
  requireVendor,
  requireCustomer,
  checkAdminEmail,
  requireOwnershipOrAdmin,
  requireVendorOwnership
};