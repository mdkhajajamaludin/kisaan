const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { checkAdminEmail } = require('../middleware/roles');
const emailService = require('../services/emailService');
const Joi = require('joi');

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().optional(),
  addresses: Joi.array().optional(),
  preferences: Joi.object().optional()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().optional(),
  addresses: Joi.array().optional(),
  preferences: Joi.object().optional()
});

// Verify Firebase token and get/create user
router.post('/verify', verifyToken, checkAdminEmail, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user,
      firebaseUser: {
        uid: req.firebaseUser.uid,
        email: req.firebaseUser.email
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register new user
router.post('/register', verifyToken, async (req, res) => {
  try {
    // Skip validation and just create a user with the provided data
    console.log('Registration request body:', req.body);
    
    // Check if user already exists
    const existingUser = await User.findByFirebaseUid(req.firebaseUser.uid);
    if (existingUser) {
      return res.status(200).json({
        success: true,
        message: 'User already exists',
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          phone: existingUser.phone,
          addresses: existingUser.addresses,
          preferences: existingUser.preferences
        }
      });
    }

    // Create new user with provided data or defaults
    const userData = {
      firebase_uid: req.firebaseUser.uid,
      email: req.firebaseUser.email,
      name: req.body.name || 'User',
      phone: req.body.phone || '',
      addresses: req.body.addresses || [],
      preferences: req.body.preferences || {}
    };

    // Check if this is the first user (make them admin)
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(userCount.rows[0].count);
    
    if (totalUsers === 0) {
      userData.role = 'admin';
      console.log('First user registered - granted admin role');
    } else {
      userData.role = 'customer';
    }

    const user = await User.create(userData);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        addresses: user.addresses,
        preferences: user.preferences
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/profile', verifyToken, checkAdminEmail, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        addresses: user.addresses,
        preferences: user.preferences,
        created_at: user.created_at,
        can_add_products: user.can_add_products,
        is_active: user.is_active
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user (alias for /profile, used by frontend)
router.get('/me', verifyToken, checkAdminEmail, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        addresses: user.addresses,
        preferences: user.preferences,
        created_at: user.created_at,
        can_add_products: user.can_add_products,
        is_active: user.is_active
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const updatedUser = await User.update(req.user.id, value);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        addresses: updatedUser.addresses,
        preferences: updatedUser.preferences
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check authentication status
router.get('/status', verifyToken, checkAdminEmail, async (req, res) => {
  try {
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (client-side only, but endpoint for consistency)
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;