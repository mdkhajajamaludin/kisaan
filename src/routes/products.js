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

// Middleware to check if vendor is active
const requireActiveVendor = async (req, res, next) => {
  try {
    console.log('requireActiveVendor - req.user:', req.user);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required - user not found' });
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
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    console.log('Looking up user with ID:', userId);
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for ID:', userId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('User found:', { id: user.id, role: user.role, is_active: user.is_active, can_add_products: user.can_add_products });
    
    // Allow admin access always
    if (user.role === 'admin') {
      req.vendor = user;
      return next();
    }
    
    // Allow vendors OR users with can_add_products permission
    if (user.role !== 'vendor' && !user.can_add_products) {
      console.log('Access denied - not vendor and no product permission');
      return res.status(403).json({ error: 'Vendor access or product permission required' });
    }
    
    // Check if user is active (only check if is_active field exists and is explicitly false)
    if (user.is_active === false) {
      console.log('Access denied - vendor account disabled');
      return res.status(403).json({ 
        error: 'Your vendor account has been disabled. Please contact support.',
        disabled: true,
        vendor_status: 'disabled'
      });
    }
    
    console.log('Access granted for user:', user.id);
    req.vendor = user;
    next();
  } catch (error) {
    console.error('Active vendor check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Validation schemas
const createProductSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(2000).optional(),
  price: Joi.number().positive().required(),
  original_price: Joi.number().positive().optional(),
  category_id: Joi.number().integer().positive().required(),
  stock_quantity: Joi.number().integer().min(0).default(0),
  min_quantity: Joi.number().integer().min(1).default(1),
  weight: Joi.string().optional(),
  origin_location: Joi.string().optional(),
  manufactured_date: Joi.string().optional(),
  expiry_date: Joi.string().optional(),
  harvest_date: Joi.string().optional(),
  organic_certified: Joi.string().optional(),
  tags: Joi.string().optional()
});

const updateProductSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  description: Joi.string().max(2000).optional(),
  price: Joi.number().positive().optional(),
  original_price: Joi.number().positive().optional(),
  category_id: Joi.number().integer().positive().optional(),
  stock_quantity: Joi.number().integer().min(0).optional(),
  min_quantity: Joi.number().integer().min(1).optional(),
  weight: Joi.string().optional(),
  origin_location: Joi.string().optional(),
  manufactured_date: Joi.string().optional(),
  expiry_date: Joi.string().optional(),
  harvest_date: Joi.string().optional(),
  organic_certified: Joi.string().optional(),
  tags: Joi.string().optional(),
  existing_images: Joi.string().optional()
});

// Helper function to get product vendor ID
const getProductVendorId = async (req) => {
  const product = await Product.findById(req.params.id);
  return product ? product.vendor_id : null;
};

// Get all products with filters
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      category_id,
      vendor_id,
      search,
      min_price,
      max_price,
      limit = 20,
      offset = 0
    } = req.query;

    const filters = {};
    if (category_id) filters.category_id = parseInt(category_id);
    if (vendor_id) filters.vendor_id = parseInt(vendor_id);
    if (search) filters.search = search;
    if (min_price) filters.min_price = parseFloat(min_price);
    if (max_price) filters.max_price = parseFloat(max_price);
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const products = await Product.getAll(filters);

    // Process images for each product
    const processedProducts = products.map(product => {
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

    res.json({
      success: true,
      products: processedProducts,
      count: products.length
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product (only matches numeric IDs)
router.get('/:id(\\d+)', optionalAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Process images
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
    
    const processedProduct = {
      ...product,
      images: images
    };

    res.json({
      success: true,
      product: processedProduct
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new product (requires product access approval)
router.post('/', verifyToken, requireProductAccess, uploadMultiple, handleUploadError, async (req, res) => {
  try {
    // User's product access is already verified by middleware
    // Access info is available in req.productAccess

    // Skip validation for now and just use the request body
    console.log('Product creation request body:', req.body);
    const value = req.body;

    // Process uploaded images (files are already uploaded to Cloudinary via multer)
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        console.log('Processing uploaded images:', req.files.length, 'files');
        const processedFiles = ImageService.processUploadedFiles(req.files);
        imageUrls = processedFiles.map(file => file.url);
        console.log('Images processed successfully:', imageUrls);
      } catch (processError) {
        console.error('Image processing error:', processError);
        // Don't fail product creation if image processing fails, just log it
        console.warn('Continuing without images due to processing error');
        imageUrls = [];
      }
    } else {
      console.log('No files uploaded');
    }

    const productData = {
      name: value.name,
      description: value.description,
      price: parseFloat(value.price),
      original_price: value.original_price ? parseFloat(value.original_price) : null,
      category_id: parseInt(value.category_id),
      stock_quantity: parseInt(value.stock_quantity),
      min_quantity: parseInt(value.min_quantity) || 1,
      weight: value.weight,
      origin_location: value.origin_location,
      manufactured_date: value.manufactured_date && value.manufactured_date !== '' ? value.manufactured_date : null,
      expiry_date: value.expiry_date && value.expiry_date !== '' ? value.expiry_date : null,
      harvest_date: value.harvest_date && value.harvest_date !== '' ? value.harvest_date : null,
      organic_certified: value.organic_certified === 'true',
      tags: value.tags ? JSON.parse(value.tags) : [],
      vendor_id: req.user.id,
      images: imageUrls
    };

    console.log('Creating product with data:', {
      ...productData,
      images: productData.images
    });
    
    try {
      const product = await Product.create(productData);
      console.log('Product created successfully:', product.id);
      console.log('Product images stored:', product.images);

      let images = [];
      try {
        // Parse images if they're stored as JSON string
        if (typeof product.images === 'string') {
          images = JSON.parse(product.images);
        } else if (Array.isArray(product.images)) {
          images = product.images;
        }
      } catch (error) {
        console.error('Error parsing created product images:', error);
        images = [];
      }

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        product: {
          ...product,
          images: images
        }
      });
    } catch (createError) {
      console.error('Product creation error:', createError);
      res.status(500).json({ 
        error: 'Failed to create product', 
        details: createError.message 
      });
    }
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Update product (product owner or admin only)
router.put('/:id', verifyToken, requireProductOwnership, uploadMultiple, handleUploadError, async (req, res) => {
  try {
    // Product ownership is already verified by middleware

    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const { error, value } = updateProductSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Get existing product
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Handle image updates
    let imageUrls = [];
    try {
      // Parse existing images
      if (typeof existingProduct.images === 'string') {
        imageUrls = JSON.parse(existingProduct.images);
      } else if (Array.isArray(existingProduct.images)) {
        imageUrls = existingProduct.images;
      }
    } catch (error) {
      console.error('Error parsing existing images:', error);
      imageUrls = [];
    }
    
    if (req.files && req.files.length > 0) {
      try {
        // Process new uploaded images (already uploaded to Cloudinary via multer)
        const processedFiles = ImageService.processUploadedFiles(req.files);
        const newImageUrls = processedFiles.map(file => file.url);
        
        // Add new images to existing ones
        imageUrls = [...imageUrls, ...newImageUrls];
      } catch (processError) {
        console.error('Image processing error:', processError);
        return res.status(400).json({ error: 'Failed to process images' });
      }
    }

    // Handle image removal if specified
    if (req.body.remove_images) {
      const imagesToRemove = JSON.parse(req.body.remove_images);
      if (Array.isArray(imagesToRemove)) {
        // Remove images from Cloudinary
        try {
          await ImageService.deleteMultipleImages(imagesToRemove);
        } catch (deleteError) {
          console.error('Image deletion error:', deleteError);
          // Continue even if deletion fails
        }
        
        // Remove from array
        imageUrls = imageUrls.filter(url => !imagesToRemove.includes(url));
      }
    }

    const updateData = {
      ...value,
      images: imageUrls
    };

    const updatedProduct = await Product.update(productId, updateData);

    let images = [];
    try {
      // Parse images if they're stored as JSON string
      if (typeof updatedProduct.images === 'string') {
        images = JSON.parse(updatedProduct.images);
      } else if (Array.isArray(updatedProduct.images)) {
        images = updatedProduct.images;
      }
    } catch (error) {
      console.error('Error parsing updated product images:', error);
      images = [];
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: {
        ...updatedProduct,
        images: images
      }
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product (product owner or admin only)
router.delete('/:id', verifyToken, requireProductOwnership, async (req, res) => {
  try {
    // Product ownership is already verified by middleware

    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      try {
        await ImageService.deleteMultipleImages(product.images);
      } catch (deleteError) {
        console.error('Image deletion error:', deleteError);
        // Continue even if deletion fails
      }
    }

    await Product.delete(productId);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get products by category
router.get('/category/:categoryId', optionalAuth, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }

    const { limit = 20, offset = 0 } = req.query;
    const products = await Product.getByCategory(categoryId, parseInt(limit), parseInt(offset));

    const processedProducts = products.map(product => {
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

    res.json({
      success: true,
      products: processedProducts,
      count: products.length
    });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search products
router.get('/search/:term', optionalAuth, async (req, res) => {
  try {
    const searchTerm = req.params.term;
    const { limit = 20, offset = 0 } = req.query;
    
    const products = await Product.search(searchTerm, parseInt(limit), parseInt(offset));

    const processedProducts = products.map(product => {
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

    res.json({
      success: true,
      products: processedProducts,
      count: products.length,
      searchTerm
    });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor's products
router.get('/vendor/:vendorId', optionalAuth, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const { limit = 20, offset = 0 } = req.query;
    const products = await Product.getByVendor(vendorId, parseInt(limit), parseInt(offset));

    const processedProducts = products.map(product => {
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

    res.json({
      success: true,
      products: processedProducts,
      count: products.length
    });
  } catch (error) {
    console.error('Get vendor products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vendor-specific routes

// Check vendor status
router.get('/vendor/status', verifyToken, async (req, res) => {
  try {
    console.log('Vendor status check - req.user:', req.user);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required - user not found' });
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
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }
    
    console.log('Looking up user with ID:', userId);
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for ID:', userId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('User found:', { 
      id: user.id, 
      email: user.email,
      role: user.role, 
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    });

    // Additional debugging
    console.log('Role check:', user.role, '=== "vendor"?', user.role === 'vendor');
    console.log('Active check:', user.is_active, '=== true?', user.is_active === true);
    console.log('Can manage products:', user.role === 'vendor' && user.is_active);
    
    res.json({
      success: true,
      vendor_status: {
        is_vendor: user.role === 'vendor',
        is_active: user.is_active,
        can_manage_products: user.role === 'vendor' && user.is_active
      },
      debug_info: {
        user_id: user.id,
        user_email: user.email,
        user_role: user.role,
        user_is_active: user.is_active,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Vendor status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's own products (for users with product access)
router.get('/my-products', verifyToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status, search } = req.query;

    let query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.vendor_id = $1
    `;

    const params = [req.user.id];
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

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM products WHERE vendor_id = $1`;
    const countParams = [req.user.id];
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

    res.json({
      success: true,
      products: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get my products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor's own products
router.get('/vendor/my-products', verifyToken, requireActiveVendor, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status, search } = req.query;
    
    let query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.vendor_id = $1
    `;
    
    const params = [req.user.id];
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
    
    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM products WHERE vendor_id = $1`;
    const countParams = [req.user.id];
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
    
    res.json({
      success: true,
      products: result.rows,
      total: parseInt(countResult.rows[0].total),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Get vendor products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor dashboard statistics
router.get('/vendor/dashboard', verifyToken, async (req, res) => {
  try {
    console.log('Vendor dashboard - req.user:', req.user);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Handle both string and number user IDs
    let vendorId;
    if (typeof req.user.id === 'string') {
      vendorId = parseInt(req.user.id);
    } else {
      vendorId = req.user.id;
    }
    
    if (isNaN(vendorId) || vendorId <= 0) {
      console.error('Invalid vendor ID received:', req.user.id, 'type:', typeof req.user.id);
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }
    
    // Allow admin or users with product access
    if (req.user.role !== 'admin' && req.user.role !== 'vendor' && !req.user.can_add_products) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You need vendor access or product permissions to view this dashboard'
      });
    }
    
    // Get product statistics
    const productStatsQuery = `
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_products,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN stock_quantity <= 5 AND stock_quantity > 0 THEN 1 END) as low_stock
      FROM products
      WHERE vendor_id = $1
    `;
    
    const productStats = await db.query(productStatsQuery, [vendorId]);
    
    // Get order statistics
    const orderStatsQuery = `
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.id END) as pending_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.id END) as completed_orders,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) as avg_order_value
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.vendor_id = $1
    `;
    
    const orderStats = await db.query(orderStatsQuery, [vendorId]);
    
    // Get recent orders
    const recentOrdersQuery = `
      SELECT DISTINCT o.id, o.total_amount, o.status, o.created_at,
             u.name as customer_name
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE p.vendor_id = $1
      ORDER BY o.created_at DESC
      LIMIT 10
    `;
    
    const recentOrders = await db.query(recentOrdersQuery, [vendorId]);
    
    // Get top selling products
    const topProductsQuery = `
      SELECT 
        p.id, p.name, p.price,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE p.vendor_id = $1 AND o.status = 'completed'
      GROUP BY p.id, p.name, p.price
      ORDER BY total_sold DESC
      LIMIT 5
    `;
    
    const topProducts = await db.query(topProductsQuery, [vendorId]);
    
    res.json({
      success: true,
      dashboard: {
        product_stats: productStats.rows[0],
        order_stats: orderStats.rows[0],
        recent_orders: recentOrders.rows,
        top_products: topProducts.rows
      }
    });
  } catch (error) {
    console.error('Vendor dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor's orders
router.get('/vendor/orders', verifyToken, requireActiveVendor, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;
    const vendorId = req.user.id;
    
    let query = `
      SELECT DISTINCT o.id, o.total_amount, o.status, o.created_at, o.updated_at,
             o.shipping_address, o.notes,
             u.name as customer_name, u.email as customer_email,
             array_agg(
               json_build_object(
                 'product_id', p.id,
                 'product_name', p.name,
                 'quantity', oi.quantity,
                 'price', oi.price
               )
             ) as items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE p.vendor_id = $1
    `;
    
    const params = [vendorId];
    let paramCount = 1;
    
    if (status) {
      paramCount++;
      query += ` AND o.status = $${paramCount}`;
      params.push(status);
    }
    
    query += `
      GROUP BY o.id, o.total_amount, o.status, o.created_at, o.updated_at,
               o.shipping_address, o.notes, u.name, u.email
      ORDER BY o.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.vendor_id = $1
    `;
    
    const countParams = [vendorId];
    let countParamCount = 1;
    
    if (status) {
      countParamCount++;
      countQuery += ` AND o.status = $${countParamCount}`;
      countParams.push(status);
    }
    
    const countResult = await db.query(countQuery, countParams);
    
    res.json({
      success: true,
      orders: result.rows,
      total: parseInt(countResult.rows[0].total),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Get vendor orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to check all users (admin only)
router.get('/vendor/debug-users', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get all users with their details
    const usersQuery = `
      SELECT id, firebase_uid, email, name, role, is_active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `;

    const usersResult = await db.query(usersQuery);

    // Get all vendor requests
    const requestsQuery = `
      SELECT vr.*, u.email as user_email
      FROM vendor_requests vr
      LEFT JOIN users u ON vr.user_id = u.id
      ORDER BY vr.created_at DESC
    `;

    const requestsResult = await db.query(requestsQuery);

    res.json({
      success: true,
      users: usersResult.rows,
      vendor_requests: requestsResult.rows,
      current_user: req.user
    });
  } catch (error) {
    console.error('Debug users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to fix vendor status (admin only)
router.post('/vendor/fix-status', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fix all vendors who have role='vendor' but is_active=false
    const fixQuery = `
      UPDATE users 
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE role = 'vendor' AND is_active = false
      RETURNING id, email, name, role, is_active
    `;

    const result = await db.query(fixQuery);
    
    console.log('Fixed vendor statuses:', result.rows);

    res.json({
      success: true,
      message: `Fixed ${result.rows.length} vendor accounts`,
      fixed_vendors: result.rows
    });
  } catch (error) {
    console.error('Fix vendor status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to manually set user as vendor (admin only)
router.post('/vendor/force-vendor/:userId', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Force set user as active vendor
    const updateQuery = `
      UPDATE users
      SET role = 'vendor', is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, name, role, is_active
    `;

    const result = await db.query(updateQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Force set user as vendor:', result.rows[0]);

    res.json({
      success: true,
      message: 'User set as active vendor',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Force vendor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to check all users (no auth required for debugging)
router.get('/debug/users', async (req, res) => {
  try {
    const query = `
      SELECT id, email, name, role, is_active, created_at, updated_at
      FROM users
      ORDER BY id
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      users: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Debug users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to check vendor requests (no auth required for debugging)
router.get('/debug/vendor-requests', async (req, res) => {
  try {
    const query = `
      SELECT vr.*, u.email as user_email, u.name as user_name, u.role as user_role, u.is_active as user_is_active
      FROM vendor_requests vr
      LEFT JOIN users u ON vr.user_id = u.id
      ORDER BY vr.created_at DESC
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      vendor_requests: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Debug vendor requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to fix vendor status (no auth required for debugging)
router.post('/debug/fix-vendors', async (req, res) => {
  try {
    // Fix all vendors who have role='vendor' but is_active=false
    const fixQuery = `
      UPDATE users
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE role = 'vendor' AND is_active = false
      RETURNING id, email, name, role, is_active
    `;

    const result = await db.query(fixQuery);

    console.log('Fixed vendor statuses:', result.rows);

    res.json({
      success: true,
      message: `Fixed ${result.rows.length} vendor accounts`,
      fixed_vendors: result.rows
    });
  } catch (error) {
    console.error('Debug fix vendors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to test vendor status for a specific user (no auth required for debugging)
router.get('/debug/vendor-status/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const query = `
      SELECT id, email, name, role, is_active, created_at, updated_at
      FROM users
      WHERE id = $1
    `;

    const result = await db.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: user,
      vendor_status: {
        is_vendor: user.role === 'vendor',
        is_active: user.is_active,
        can_manage_products: user.role === 'vendor' && user.is_active
      }
    });
  } catch (error) {
    console.error('Debug vendor status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple product creation endpoint
router.post('/user-products', verifyToken, async (req, res) => {
  try {
    console.log('Create product request - user:', req.user);
    console.log('Request body:', req.body);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    // Handle both string and number user IDs
    let userId = req.user.id;
    if (typeof userId === 'string') {
      userId = parseInt(userId);
    }
    
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid user ID' 
      });
    }

    const { name, description, price, category_id, stock_quantity = 0 } = req.body;

    if (!name || !price || !category_id) {
      return res.status(400).json({
        success: false,
        error: 'Name, price, and category are required'
      });
    }

    const query = `
      INSERT INTO products (
        name, description, price, category_id, stock_quantity, 
        vendor_id, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await db.query(query, [
      name,
      description || '',
      parseFloat(price),
      parseInt(category_id),
      parseInt(stock_quantity),
      userId
    ]);

    console.log('Product created:', result.rows[0]);

    res.json({
      success: true,
      message: 'Product created successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Simple working endpoint for user products
router.get('/user-products', verifyToken, async (req, res) => {
  try {
    console.log('User products request - user:', req.user);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    // Handle both string and number user IDs
    let userId = req.user.id;
    if (typeof userId === 'string') {
      userId = parseInt(userId);
    }
    
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid user ID' 
      });
    }

    // Simple query without complex parameter building
    const query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.vendor_id = $1
      ORDER BY p.created_at DESC
      LIMIT 50
    `;

    console.log('Executing query for user ID:', userId);
    const result = await db.query(query, [userId]);

    // Process images for each product
    const processedProducts = result.rows.map(product => {
      let images = [];
      try {
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
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get user products error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Simple vendor dashboard endpoint that works for any authenticated user
router.get('/vendor/simple-dashboard', verifyToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // Get basic stats for any user
    const productStatsQuery = `
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_products,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN stock_quantity <= 5 AND stock_quantity > 0 THEN 1 END) as low_stock
      FROM products
      WHERE vendor_id = $1
    `;
    
    const productStats = await db.query(productStatsQuery, [userId]);
    
    // Get order statistics
    const orderStatsQuery = `
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.id END) as pending_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.id END) as completed_orders,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN oi.quantity * oi.price ELSE 0 END), 0) as total_revenue
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.vendor_id = $1
    `;
    
    const orderStats = await db.query(orderStatsQuery, [userId]);
    
    // Get recent products
    const recentProductsQuery = `
      SELECT id, name, price, stock_quantity, is_active, created_at
      FROM products
      WHERE vendor_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    const recentProducts = await db.query(recentProductsQuery, [userId]);
    
    res.json({
      success: true,
      dashboard: {
        user_info: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
          role: req.user.role
        },
        product_stats: productStats.rows[0] || {
          total_products: 0,
          active_products: 0,
          out_of_stock: 0,
          low_stock: 0
        },
        order_stats: orderStats.rows[0] || {
          total_orders: 0,
          pending_orders: 0,
          completed_orders: 0,
          total_revenue: 0
        },
        recent_products: recentProducts.rows || []
      }
    });
  } catch (error) {
    console.error('Simple vendor dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple product toggle status endpoint
router.put('/:id/simple-toggle', verifyToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { is_active } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean value' });
    }

    // Check if user owns the product or is admin
    const checkQuery = 'SELECT vendor_id FROM products WHERE id = $1';
    const checkResult = await db.query(checkQuery, [productId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = checkResult.rows[0];
    if (req.user.role !== 'admin' && product.vendor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only toggle your own products' });
    }

    // Update product status
    const updateQuery = `
      UPDATE products 
      SET is_active = $1, updated_at = NOW() 
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, [is_active, productId]);

    res.json({
      success: true,
      message: `Product ${is_active ? 'activated' : 'deactivated'} successfully`,
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Simple toggle product status error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

module.exports = router;