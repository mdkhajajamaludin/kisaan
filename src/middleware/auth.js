const admin = require('../config/firebase');
const User = require('../models/User');
const db = require('../config/database');

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    // For development, we'll extract user info from the token payload
    // In production, you would verify this with Firebase Admin SDK
    let firebaseUser;
    let userData;
    
    try {
      // Try to decode the JWT token to get user info
      // Note: This is for development only - in production you should verify the token
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      
      firebaseUser = {
        uid: payload.user_id || payload.sub,
        email: payload.email,
        name: payload.name || payload.display_name,
        email_verified: payload.email_verified
      };
      
      console.log('Decoded Firebase user:', firebaseUser.email);
      
    } catch (decodeError) {
      console.warn('Token decode failed, using fallback method');
      
      // Fallback: create user based on a hash of the token
      const tokenHash = require('crypto').createHash('md5').update(token).digest('hex').substring(0, 8);
      firebaseUser = {
        uid: `dev-user-${tokenHash}`,
        email: `user-${tokenHash}@example.com`,
        name: `User ${tokenHash}`,
        email_verified: true
      };
    }

    // Find or create user in database based on Firebase UID
    try {
      let user = await User.findByFirebaseUid(firebaseUser.uid);
      
      if (!user) {
        // Create new user
        console.log('Creating new user for Firebase UID:', firebaseUser.uid);
        
        const newUserData = {
          firebase_uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.name || 'User',
          role: 'customer', // Default role
          phone: '',
          addresses: [],
          preferences: {}
        };
        
        // Set admin role for specific email
        if (firebaseUser.email === 'dev.unity.cc@gmail.com') {
          newUserData.role = 'admin';
          console.log('Admin email detected - granted admin role');
        }
        
        try {
          user = await User.create(newUserData);
        } catch (createError) {
          if (createError.code === '23505') {
            // User already exists with this email, try to find by email
            console.log('User already exists, finding by email');
            user = await User.findByEmail(firebaseUser.email);
            if (!user) {
              throw new Error('User exists but could not be found');
            }
          } else {
            throw createError;
          }
        }
      }
      
      // Add user info to request
      req.user = user;
      req.firebaseUser = firebaseUser;
      
      console.log(`Authenticated user: ${user.email} (ID: ${user.id})`);
      next();
      
    } catch (dbError) {
      console.error('Database error in auth middleware:', dbError);
      return res.status(500).json({ error: 'Database error' });
    }
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    // Always add a mock user for development
    req.user = {
      id: 1,
      firebase_uid: 'optional-admin-uid',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      phone: '',
      addresses: [],
      preferences: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    req.firebaseUser = { uid: 'optional-admin-uid', email: 'admin@example.com' };
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    console.warn('Optional auth failed:', error.message);
    next();
  }
};

const requireAdmin = (req, res, next) => {
  console.log('🔐 requireAdmin middleware called');
  console.log('User:', req.user);
  
  if (!req.user) {
    console.log('❌ No user found');
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    console.log('❌ User is not admin, role:', req.user.role);
    return res.status(403).json({ error: 'Admin access required' });
  }

  console.log('✅ Admin access granted');
  next();
};

module.exports = {
  verifyToken,
  optionalAuth,
  requireAdmin
};