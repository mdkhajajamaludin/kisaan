const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');
const Joi = require('joi');

// Get admin dashboard data
router.get('/dashboard', verifyToken, requireAdmin, async (req, res) => {
  try {
    // Get basic counts
    const usersCount = await db.query('SELECT COUNT(*) as count FROM users');
    const productsCount = await db.query('SELECT COUNT(*) as count FROM products WHERE is_active = true');
    const ordersCount = await db.query('SELECT COUNT(*) as count FROM orders');

    // Get recent orders
    const recentOrders = await Order.getAll({}, { limit: 5, offset: 0 });

    // Get monthly revenue
    const monthlyRevenueQuery = `
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(total_amount) as revenue,
        COUNT(*) as orders_count
      FROM orders 
      WHERE status = 'delivered' 
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `;
    const monthlyRevenue = await db.query(monthlyRevenueQuery);

    // Get top selling products
    const topProductsQuery = `
      SELECT 
        p.id, p.name, p.price,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'delivered' AND p.is_active = true
      GROUP BY p.id, p.name, p.price
      ORDER BY total_sold DESC
      LIMIT 10
    `;
    const topProducts = await db.query(topProductsQuery);

    // Get order status distribution
    const orderStatusQuery = `
      SELECT status, COUNT(*) as count
      FROM orders
      GROUP BY status
      ORDER BY count DESC
    `;
    const orderStatus = await db.query(orderStatusQuery);

    // Get low stock products
    const lowStockQuery = `
      SELECT id, name, stock_quantity, price
      FROM products
      WHERE stock_quantity <= 5 AND is_active = true
      ORDER BY stock_quantity ASC
      LIMIT 10
    `;
    const lowStock = await db.query(lowStockQuery);

    // Get recent activity (new products in last 24 hours)
    const recentActivityQuery = `
      SELECT 
        p.id, 
        CONCAT('New Product: ', p.name) as action, 
        p.created_at as time,
        'product' as type
      FROM products p
      WHERE p.created_at >= NOW() - INTERVAL '24 hours'
      UNION ALL
      SELECT 
        o.id, 
        CONCAT('New Order #', o.id, ' by ', u.name) as action, 
        o.created_at as time,
        'order' as type
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY time DESC
      LIMIT 10
    `;
    const recentActivity = await db.query(recentActivityQuery);

    const dashboardData = {
      stats: {
        totalUsers: parseInt(usersCount.rows[0].count),
        totalProducts: parseInt(productsCount.rows[0].count),
        totalOrders: parseInt(ordersCount.rows[0].count)
      },
      recentOrders: recentOrders.orders || [],
      monthlyRevenue: monthlyRevenue.rows,
      topProducts: topProducts.rows,
      orderStatusDistribution: orderStatus.rows,
      lowStockProducts: lowStock.rows,
      recentActivity: recentActivity.rows
    };

    res.json({
      success: true,
      dashboard: dashboardData
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all users (admin only)
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, search, role } = req.query;

    let query = `
      SELECT id, email, name, role, is_active, can_add_products, created_at, updated_at
      FROM users
    `;

    const conditions = [];
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      conditions.push(`(email ILIKE $${paramCount} OR name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    if (role && role !== 'all') {
      paramCount++;
      conditions.push(`role = $${paramCount}`);
      params.push(role);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` WHERE (email ILIKE $${countParamCount} OR name ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (role && role !== 'all') {
      countParamCount++;
      if (countParams.length === 0) {
        countQuery += ` WHERE role = $${countParamCount}`;
      } else {
        countQuery += ` AND role = $${countParamCount}`;
      }
      countParams.push(role);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      success: true,
      users: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle user product access (admin only)
router.put('/users/:id/product-access', verifyToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { admin_notes } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Get current user
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const newAccessStatus = !user.can_add_products;

    // Update user product access
    await db.query(
      'UPDATE users SET can_add_products = $1, updated_at = NOW() WHERE id = $2',
      [newAccessStatus, userId]
    );

    // Create notification
    try {
      await Notification.create({
        user_id: userId,
        type: 'product_access_updated',
        title: newAccessStatus ? '✅ Product Access Granted' : '❌ Product Access Revoked',
        message: newAccessStatus
          ? 'You now have permission to add and manage products.'
          : 'Your product management access has been revoked.',
        data: {
          admin_notes: admin_notes || null,
          access_granted: newAccessStatus
        }
      });
    } catch (notifError) {
      console.error('Product access notification error:', notifError);
    }

    res.json({
      success: true,
      message: `Product access ${newAccessStatus ? 'granted' : 'revoked'} successfully`
    });
  } catch (error) {
    console.error('Toggle product access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders (admin only)
router.get('/orders', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, status, search } = req.query;

    const filters = {};
    if (status && status !== 'all') filters.status = status;
    if (search) filters.search = search;

    const paginationOptions = {
      limit: Math.min(parseInt(limit) || 50, 100),
      offset: parseInt(offset) || 0
    };

    const result = await Order.getAll(filters, paginationOptions);

    res.json({
      success: true,
      orders: result.orders,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (admin only)
router.put('/orders/:id/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status, admin_notes } = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await Order.updateStatus(orderId, status, admin_notes);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics data (admin only)
router.get('/analytics', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    let interval = '30 days';
    if (period === '7d') interval = '7 days';
    if (period === '90d') interval = '90 days';
    if (period === '1y') interval = '1 year';

    // 1. Overview Metrics Calculations
    // Current Period Metrics
    const currentMetricsQuery = `
      SELECT 
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as orders,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '${interval}'
    `;

    // Previous Period Metrics (for growth)
    const previousMetricsQuery = `
      SELECT 
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as orders,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE status = 'delivered' 
      AND created_at < NOW() - INTERVAL '${interval}' 
      AND created_at >= NOW() - INTERVAL '${interval}' * 2
    `;

    // Customer Metrics
    const currentCustomersQuery = `SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL '${interval}'`;
    const previousCustomersQuery = `SELECT COUNT(*) as count FROM users WHERE created_at < NOW() - INTERVAL '${interval}' AND created_at >= NOW() - INTERVAL '${interval}' * 2`;
    const totalCustomersQuery = `SELECT COUNT(*) as count FROM users`;

    const [currentMetrics, prevMetrics, currentCustomers, prevCustomers, totalCustomers] = await Promise.all([
      db.query(currentMetricsQuery),
      db.query(previousMetricsQuery),
      db.query(currentCustomersQuery),
      db.query(previousCustomersQuery),
      db.query(totalCustomersQuery)
    ]);

    const cur = currentMetrics.rows[0];
    const prev = prevMetrics.rows[0];
    const curCust = parseInt(currentCustomers.rows[0].count);
    const prevCust = parseInt(prevCustomers.rows[0].count);
    const totalCust = parseInt(totalCustomers.rows[0].count);

    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const overview = {
      totalRevenue: parseFloat(cur.revenue),
      revenueGrowth: calculateGrowth(parseFloat(cur.revenue), parseFloat(prev.revenue)),
      totalOrders: parseInt(cur.orders),
      ordersGrowth: calculateGrowth(parseInt(cur.orders), parseInt(prev.orders)),
      totalCustomers: totalCust,
      customersGrowth: calculateGrowth(curCust, prevCust),
      avgOrderValue: parseFloat(cur.avg_order_value),
      avgOrderGrowth: calculateGrowth(parseFloat(cur.avg_order_value), parseFloat(prev.avg_order_value))
    };

    // 2. Chart Data (Sales Trend)
    const salesQuery = `
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        COUNT(*) as orders,
        SUM(total_amount) as revenue
      FROM orders 
      WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY date
    `;
    const salesData = await db.query(salesQuery);

    const chartData = salesData.rows.map(row => ({
      name: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: parseFloat(row.revenue),
      orders: parseInt(row.orders)
    }));

    // 3. Top Products
    const productQuery = `
      SELECT 
        p.name,
        SUM(oi.quantity) as sales,
        SUM(oi.quantity * oi.price) as revenue
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'delivered' AND o.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 10
    `;
    const topProducts = await db.query(productQuery);

    // 4. User Growth
    const userGrowthQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `;
    const userGrowth = await db.query(userGrowthQuery);

    // 5. Order Status Distribution
    const orderStatusQuery = `
      SELECT status, COUNT(*) as count 
      FROM orders 
      GROUP BY status 
      ORDER BY count DESC
    `;
    const orderStatus = await db.query(orderStatusQuery);

    // 6. Recent Activity
    const recentActivityQuery = `
      SELECT 
        p.id, 
        CONCAT('New Product: ', p.name) as action, 
        p.created_at as time,
        'product' as type
      FROM products p
      WHERE p.created_at >= NOW() - INTERVAL '24 hours'
      UNION ALL
      SELECT 
        o.id, 
        CONCAT('New Order #', o.id, ' by ', u.name) as action, 
        o.created_at as time,
        'order' as type
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY time DESC
      LIMIT 10
    `;
    const recentActivity = await db.query(recentActivityQuery);

    res.json({
      success: true,
      analytics: {
        overview,
        chartData,
        topProducts: topProducts.rows.map(row => ({
          name: row.name,
          sales: parseInt(row.sales),
          revenue: parseFloat(row.revenue)
        })),
        userGrowth: userGrowth.rows,
        orderStatusDistribution: orderStatus.rows,
        recentActivity: recentActivity.rows,
        quickStats: {
          pageViews: 0,
          conversionRate: 0,
          avgSessionDuration: 0
        }
      }
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;