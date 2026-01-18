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

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access denied',
      message: 'You do not have administrative privileges'
    });
  }

  next();
};
const requireCustomer = requireRole(['admin', 'customer']);

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



module.exports = {
  requireRole,
  requireAdmin,
  requireCustomer,
  checkAdminEmail,
  requireOwnershipOrAdmin
};