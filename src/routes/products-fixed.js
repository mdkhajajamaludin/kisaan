const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const db = require('../config/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { requireVendor, requireVendorOwnership } = require('../middleware/roles');
const { requireProductAccess, requireProductOwnership } = require('../middleware/productAccess');
const { uploadMultiple, handleUploadError } = require('../middleware/upload');
const ImageService = require('../services/imageService');
const Joi = require('joi');

// Get user's own products (for users with product access) - FIXED VERSION
router.get('/my-products', verifyToken, async (req, res) => {
  try {
    console.log('My products request - user:', req.user);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required - user not found' 
      });
    }

    // Handle both string and number user IDs
    let userId;
    if (typeof req.user.id === 'string') {
      userId = parseInt(req.user.id);
    } else {
      userId = req.user.id;
    }
    
    if (isNaN(userId) || userId <= 0) {
      console.error('Invalid user ID received:', req.user.id, 'type:', typeof req.user.id);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid user ID' 
      });
    }

    const { limit = 20, offset = 0, status, search } = req.query;

    let query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.vendor_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND p.is_active = $${paramCount}`;
      params.push(status === 'active');
    }

    if (search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    console.log('Executing query:', query);
    console.log('With params:', params);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM products WHERE vendor_id = $1`;
    const countParams = [userId];
    let countParamCount = 1;

    if (status) {
      countParamCount++;
      countQuery += ` AND is_active = $${countParamCount}`;
      countParams.push(status === 'active');
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (name ILIKE $${countParamCount} OR description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await db.query(countQuery, countParams);

    // Process images for each product
    const processedProducts = result.rows.map(product => {
      let images = [];
      try {
        // Parse images if they're stored as JSON string
        if (typeof product.images === 'string') {
          images = JSON.parse(product.images);
        } else if (Array.isArray(product.images)) {
          images = product.images;
        }
      } catch (error) {
        console.error('Error parsing product images:', error);
        images = [];
      }
      
      return {
        ...product,
        images: images
      };
    });

    console.log(`Found ${result.rows.length} products for user ${userId}`);

    res.json({
      success: true,
      products: processedProducts,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get my products error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    });
  }
});

module.exports = router;