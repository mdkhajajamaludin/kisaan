const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

// Get all products with admin filters
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      search,
      category_id,
      vendor_id,
      is_active,
      low_stock
    } = req.query;

    let query = `
      SELECT 
        p.*,
        c.name as category_name,
        u.name as vendor_name,
        u.email as vendor_email
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (category_id) {
      paramCount++;
      query += ` AND p.category_id = $${paramCount}`;
      params.push(parseInt(category_id));
    }

    if (vendor_id) {
      paramCount++;
      query += ` AND p.vendor_id = $${paramCount}`;
      params.push(parseInt(vendor_id));
    }

    if (is_active !== undefined) {
      paramCount++;
      query += ` AND p.is_active = $${paramCount}`;
      params.push(is_active === 'true');
    }

    if (low_stock === 'true') {
      query += ` AND p.stock_quantity <= 5`;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE 1=1
    `;

    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (category_id) {
      countParamCount++;
      countQuery += ` AND p.category_id = $${countParamCount}`;
      countParams.push(parseInt(category_id));
    }

    if (vendor_id) {
      countParamCount++;
      countQuery += ` AND p.vendor_id = $${countParamCount}`;
      countParams.push(parseInt(vendor_id));
    }

    if (is_active !== undefined) {
      countParamCount++;
      countQuery += ` AND p.is_active = $${countParamCount}`;
      countParams.push(is_active === 'true');
    }

    if (low_stock === 'true') {
      countQuery += ` AND p.stock_quantity <= 5`;
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
    console.error('Get admin products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle product status
router.put('/:id/toggle-status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { admin_notes } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Get current product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newStatus = !product.is_active;

    // Update product status
    const updatedProduct = await Product.update(productId, { is_active: newStatus });

    // Log admin action (if audit logging is implemented)
    try {
      await db.query(`
        INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        req.user.id,
        'product_status_change',
        'product',
        productId,
        JSON.stringify({
          old_status: product.is_active,
          new_status: newStatus,
          admin_notes: admin_notes
        })
      ]);
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    res.json({
      success: true,
      message: `Product ${newStatus ? 'enabled' : 'disabled'} successfully`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('Toggle product status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk product actions
router.post('/bulk-action', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { product_ids, action, admin_notes } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'Product IDs are required' });
    }

    if (!['enable', 'disable', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const results = [];

    for (const productId of product_ids) {
      try {
        if (action === 'delete') {
          await Product.delete(productId);
          results.push({ productId, success: true, action: 'deleted' });
        } else {
          const isActive = action === 'enable';
          await Product.update(productId, { is_active: isActive });
          results.push({ productId, success: true, action: action + 'd' });
        }

        // Log admin action
        try {
          await db.query(`
            INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          `, [
            req.user.id,
            `product_${action}`,
            'product',
            productId,
            JSON.stringify({ admin_notes: admin_notes })
          ]);
        } catch (logError) {
          console.error('Failed to log admin action:', logError);
        }
      } catch (error) {
        results.push({ productId, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `${successCount} products ${action}d successfully`,
      results
    });
  } catch (error) {
    console.error('Bulk product action error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product details with vendor info
router.get('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const query = `
      SELECT 
        p.*,
        c.name as category_name,
        u.name as vendor_name,
        u.email as vendor_email,
        u.phone as vendor_phone
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE p.id = $1
    `;

    const result = await db.query(query, [productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];

    // Get product order history
    const orderHistoryQuery = `
      SELECT 
        o.id as order_id,
        o.created_at as order_date,
        o.status as order_status,
        oi.quantity,
        oi.price,
        u.name as customer_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN users u ON o.user_id = u.id
      WHERE oi.product_id = $1
      ORDER BY o.created_at DESC
      LIMIT 10
    `;

    const orderHistory = await db.query(orderHistoryQuery, [productId]);

    res.json({
      success: true,
      product: {
        ...product,
        order_history: orderHistory.rows
      }
    });
  } catch (error) {
    console.error('Get product details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;