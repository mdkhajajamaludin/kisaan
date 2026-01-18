const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const db = require('../config/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { requireProductAccess, requireProductOwnership } = require('../middleware/productAccess');
const { uploadMultiple, handleUploadError } = require('../middleware/upload');
const ImageService = require('../services/imageService');
const Joi = require('joi');

// Validation schemas
const createProductSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(2000).optional().allow(''),
  price: Joi.number().positive().required(),
  original_price: Joi.number().positive().optional().allow(null, ''),
  category_id: Joi.number().integer().positive().required(),
  stock_quantity: Joi.number().integer().min(0).optional(),
  min_quantity: Joi.number().integer().min(1).optional(),
  weight: Joi.string().max(100).optional().allow('', null),
  origin_location: Joi.string().max(255).optional().allow('', null),
  manufactured_date: Joi.date().optional().allow('', null),
  expiry_date: Joi.date().optional().allow('', null),
  harvest_date: Joi.date().optional().allow('', null),
  organic_certified: Joi.boolean().optional(),
  tags: Joi.string().optional().allow('')
});

const updateProductSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  description: Joi.string().max(2000).optional().allow(''),
  price: Joi.number().positive().optional(),
  original_price: Joi.number().positive().optional().allow(null, ''),
  category_id: Joi.number().integer().positive().optional(),
  stock_quantity: Joi.number().integer().min(0).optional(),
  min_quantity: Joi.number().integer().min(1).optional(),
  weight: Joi.string().max(100).optional().allow('', null),
  origin_location: Joi.string().max(255).optional().allow('', null),
  manufactured_date: Joi.date().optional().allow('', null),
  expiry_date: Joi.date().optional().allow('', null),
  harvest_date: Joi.date().optional().allow('', null),
  organic_certified: Joi.boolean().optional(),
  tags: Joi.string().optional().allow(''),
  is_active: Joi.boolean().optional(),
  existing_images: Joi.string().optional().allow('')
});

// Get all products with filtering and pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      category_id,
      search,
      min_price,
      max_price,
      organic_only,
      vendor_id,
      is_active,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = 20,
      offset = 0
    } = req.query;

    const filters = {};
    if (category_id) filters.category_id = parseInt(category_id);
    if (search) filters.search = search;
    if (min_price) filters.min_price = parseFloat(min_price);
    if (max_price) filters.max_price = parseFloat(max_price);
    if (organic_only === 'true') filters.organic_only = true;
    if (vendor_id) filters.vendor_id = parseInt(vendor_id);

    // Handle is_active filter safely
    if (is_active !== undefined) {
      const activeValue = is_active === 'true' ? true : is_active === 'false' ? false : is_active === 'all' ? 'all' : true;

      // Security check: Only allow viewing inactive/all products if user is admin or viewing their own products
      if (activeValue !== true) {
        const canViewInactive = req.user && (
          req.user.role === 'admin' ||
          (filters.vendor_id && req.user.id === filters.vendor_id)
        );

        if (canViewInactive) {
          filters.is_active = activeValue;
        } else {
          // Default to true if unauthorized
          filters.is_active = true;
        }
      } else {
        filters.is_active = true;
      }
    }

    const sortOptions = {
      sort_by: ['name', 'price', 'created_at'].includes(sort_by) ? sort_by : 'created_at',
      sort_order: ['asc', 'desc'].includes(sort_order) ? sort_order : 'desc'
    };

    const paginationOptions = {
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0
    };

    const result = await Product.findAll(filters, sortOptions, paginationOptions);

    res.json({
      success: true,
      products: result.products,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create new product (admin only)
router.post('/', verifyToken, requireProductAccess, uploadMultiple, async (req, res) => {
  try {
    const { error, value } = createProductSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Handle image uploads
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        const processedImages = ImageService.processUploadedFiles(req.files);
        imageUrls = processedImages.map(img => img.url);
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(400).json({ error: 'Failed to upload images' });
      }
    }

    const productData = {
      ...value,
      organic_certified: value.organic_certified === 'true',
      tags: value.tags ? JSON.parse(value.tags) : [],
      images: imageUrls
    };

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (admin only)
router.put('/:id', verifyToken, requireProductOwnership, uploadMultiple, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Allow unknown fields to strip them or just validate known ones. 
    // Since we are strictly defining schema, adding existing_images to schema is best.
    const { error, value } = updateProductSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Handle image uploads if provided
    let newImageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        const processedImages = ImageService.processUploadedFiles(req.files);
        newImageUrls = processedImages.map(img => img.url);
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(400).json({ error: 'Failed to upload images' });
      }
    }

    const updateData = { ...value };

    // Process images: merge existing and new
    let finalImages = [];

    // parser existing_images if present
    if (value.existing_images) {
      try {
        const parsedExisting = JSON.parse(value.existing_images);
        if (Array.isArray(parsedExisting)) {
          finalImages = parsedExisting;
        }
      } catch (e) {
        console.error('Error parsing existing_images:', e);
      }
    }

    // Append new images
    if (newImageUrls.length > 0) {
      finalImages = [...finalImages, ...newImageUrls];
    }

    // Only update images if we have any (either existing kept or new added)
    // If existing_images was sent (even empty) or new files uploaded, we update the images list
    if (value.existing_images !== undefined || newImageUrls.length > 0) {
      updateData.images = finalImages;
    }

    // Clean up fields not in DB or handled separately
    delete updateData.existing_images;

    if (value.organic_certified !== undefined) {
      updateData.organic_certified = value.organic_certified === 'true';
    }
    if (value.tags) {
      try {
        // If it's already an object/array (handled by body parser for JSON content-type), use it
        // But here it likely comes as string from FormData
        updateData.tags = typeof value.tags === 'string' ? JSON.parse(value.tags) : value.tags;
      } catch (e) {
        updateData.tags = [];
      }
    }

    const product = await Product.update(productId, updateData);

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (admin only)
router.delete('/:id', verifyToken, requireProductOwnership, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    await Product.delete(productId);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Toggle product active status (admin only)
router.patch('/:id/toggle', verifyToken, requireProductOwnership, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedProduct = await Product.update(productId, {
      is_active: !product.is_active
    });

    res.json({
      success: true,
      message: `Product ${updatedProduct.is_active ? 'activated' : 'deactivated'} successfully`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('Toggle product error:', error);
    res.status(500).json({ error: 'Failed to toggle product status' });
  }
});

// Get products by category
router.get('/category/:categoryId', optionalAuth, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }

    const {
      limit = 20,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const filters = { category_id: categoryId };
    const sortOptions = {
      sort_by: ['name', 'price', 'created_at'].includes(sort_by) ? sort_by : 'created_at',
      sort_order: ['asc', 'desc'].includes(sort_order) ? sort_order : 'desc'
    };
    const paginationOptions = {
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0
    };

    const result = await Product.findAll(filters, sortOptions, paginationOptions);

    res.json({
      success: true,
      products: result.products,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

module.exports = router;