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
    const recentOrders = await Order.getAll({ limit: 5, offset: 0 });

    // Get monthly revenue
    const monthlyRevenueQuery = `
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(total_amount) as revenue,
        COUNT(*) as orders_count
      FROM orders 
      WHERE status = 'completed' 
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
      WHERE o.status = 'completed' AND p.is_active = true
      GROUP BY p.id, p.name, p.price
      ORDER BY total_sold DESC
      LIMIT 5
    `;
    const topProducts = await db.query(topProductsQuery);

    // Get order status distribution
    const orderStatusQuery = `
      SELECT status, COUNT(*) as count
      FROM orders
      GROUP BY status
    `;
    const orderStatusDistribution = await db.query(orderStatusQuery);

    // Get low stock products
    const lowStockQuery = `
      SELECT id, name, stock_quantity, price
      FROM products
      WHERE stock_quantity <= 5 AND is_active = true
      ORDER BY stock_quantity ASC
      LIMIT 10
    `;
    const lowStockProducts = await db.query(lowStockQuery);

    const dashboardData = {
      stats: {
        totalUsers: parseInt(usersCount.rows[0].count),
        totalProducts: parseInt(productsCount.rows[0].count),
        totalOrders: parseInt(ordersCount.rows[0].count),

      },
      recentOrders,
      monthlyRevenue: monthlyRevenue.rows,
      topProducts: topProducts.rows,
      orderStatusDistribution: orderStatusDistribution.rows,
      lowStockProducts: lowStockProducts.rows
    };

    res.json({
      success: true,
      dashboard: dashboardData
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users with pagination
router.get('/users', verifyToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, role, search } = req.query;

    let query = `
      SELECT id, email, name, role, phone, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    res.json({
      success: true,
      users: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role
router.put('/users/:id/role', verifyToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { role } = req.body;
    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = await User.updateRole(userId, role);

    res.json({
      success: true,
      message: 'User role updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders with advanced filtering
router.get('/orders', verifyToken, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status,
      start_date,
      end_date,
      user_id
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (user_id) filters.user_id = parseInt(user_id);
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const orders = await Order.getAll(filters);

    res.json({
      success: true,
      orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Get admin orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics data with real metrics
router.get('/analytics', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    let startDate;
    let prevStartDate;
    const endDate = new Date();

    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        prevStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        prevStartDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        prevStartDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        prevStartDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        prevStartDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    }

    // Current period revenue and orders
    const currentPeriodQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status != 'cancelled'
    `;
    const currentPeriod = await db.query(currentPeriodQuery, [startDate, endDate]);

    // Previous period for comparison
    const previousPeriodQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status != 'cancelled'
    `;
    const previousPeriod = await db.query(previousPeriodQuery, [prevStartDate, startDate]);

    // Calculate growth percentages
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const currentStats = currentPeriod.rows[0];
    const prevStats = previousPeriod.rows[0];

    const revenueGrowth = calculateGrowth(
      parseFloat(currentStats.total_revenue),
      parseFloat(prevStats.total_revenue)
    );
    const ordersGrowth = calculateGrowth(
      parseInt(currentStats.total_orders),
      parseInt(prevStats.total_orders)
    );
    const avgOrderGrowth = calculateGrowth(
      parseFloat(currentStats.avg_order_value),
      parseFloat(prevStats.avg_order_value)
    );

    // Total customers (current period)
    const customersQuery = `
      SELECT COUNT(DISTINCT user_id) as total_customers
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
    `;
    const currentCustomers = await db.query(customersQuery, [startDate, endDate]);
    const prevCustomers = await db.query(customersQuery, [prevStartDate, startDate]);
    
    const customersGrowth = calculateGrowth(
      parseInt(currentCustomers.rows[0].total_customers || 0),
      parseInt(prevCustomers.rows[0].total_customers || 0)
    );

    // Daily revenue data for chart
    const dailyRevenueQuery = `
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `;
    const dailyRevenue = await db.query(dailyRevenueQuery, [startDate, endDate]);

    // Format chart data (last 7 days)
    const chartData = dailyRevenue.rows.reverse().map(row => ({
      name: new Date(row.date).toLocaleDateString('en-US', { weekday: 'short' }),
      revenue: parseFloat(row.revenue),
      orders: parseInt(row.orders)
    }));

    // Top products
    const topProductsQuery = `
      SELECT 
        p.id, p.name,
        SUM(oi.quantity) as sales,
        SUM(oi.quantity * oi.price) as revenue
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at BETWEEN $1 AND $2 AND o.status != 'cancelled'
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 5
    `;
    const topProducts = await db.query(topProductsQuery, [startDate, endDate]);

    // Order status distribution
    const statusDistQuery = `
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY status
    `;
    const statusDist = await db.query(statusDistQuery, [startDate, endDate]);

    // User growth data
    const userGrowthQuery = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `;
    const userGrowth = await db.query(userGrowthQuery, [startDate, endDate]);

    // Recent activity (last 10 activities)
    const recentActivityQuery = `
      SELECT
        'order' as type,
        o.id,
        'Order #' || o.id || ' placed' as action,
        o.created_at,
        u.name as user_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.created_at >= NOW() - INTERVAL '24 hours'
      UNION ALL
      SELECT
        'product' as type,
        p.id,
        'Product "' || p.name || '" added' as action,
        p.created_at,
        u.name as user_name
      FROM products p
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE p.created_at >= NOW() - INTERVAL '24 hours'
      UNION ALL
      SELECT
        'user' as type,
        u.id,
        'User "' || u.name || '" registered' as action,
        u.created_at,
        u.name as user_name
      FROM users u
      WHERE u.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const recentActivity = await db.query(recentActivityQuery);

    // Calculate conversion rate (orders / unique visitors)
    // For now, we'll use orders / customers as a proxy
    const conversionRate = currentCustomers.rows[0].total_customers > 0
      ? (parseInt(currentStats.total_orders) / parseInt(currentCustomers.rows[0].total_customers)) * 100
      : 0;

    // Calculate page views (sum of product views)
    // Note: view_count column may not exist in all database schemas
    let pageViewsResult;
    try {
      const pageViewsQuery = `
        SELECT COALESCE(SUM(view_count), 0) as total_views
        FROM products
      `;
      pageViewsResult = await db.query(pageViewsQuery);
    } catch (error) {
      // If view_count column doesn't exist, default to 0
      console.log('Note: view_count column not found, defaulting to 0');
      pageViewsResult = { rows: [{ total_views: 0 }] };
    }

    // Calculate average session duration (mock for now - would need session tracking)
    // Using average time between order creation and completion as proxy
    const avgSessionQuery = `
      SELECT
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status = 'completed'
    `;
    const avgSession = await db.query(avgSessionQuery, [startDate, endDate]);
    const avgSessionSeconds = parseInt(avgSession.rows[0]?.avg_duration || 0);

    const analytics = {
      overview: {
        totalRevenue: parseFloat(currentStats.total_revenue),
        revenueGrowth: Math.round(revenueGrowth * 10) / 10,
        totalOrders: parseInt(currentStats.total_orders),
        ordersGrowth: Math.round(ordersGrowth * 10) / 10,
        totalCustomers: parseInt(currentCustomers.rows[0].total_customers || 0),
        customersGrowth: Math.round(customersGrowth * 10) / 10,
        avgOrderValue: parseFloat(currentStats.avg_order_value),
        avgOrderGrowth: Math.round(avgOrderGrowth * 10) / 10
      },
      chartData,
      topProducts: topProducts.rows.map(p => ({
        name: p.name,
        sales: parseInt(p.sales),
        revenue: parseFloat(p.revenue)
      })),
      orderStatusDistribution: statusDist.rows,
      userGrowth: userGrowth.rows.map(row => ({
        date: row.date,
        new_users: parseInt(row.new_users)
      })),
      recentActivity: recentActivity.rows.map(row => ({
        type: row.type,
        action: row.action,
        time: row.created_at,
        user_name: row.user_name
      })),
      quickStats: {
        pageViews: parseInt(pageViewsResult.rows[0].total_views || 0),
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgSessionDuration: avgSessionSeconds
      }
    };

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get system health status
router.get('/health', verifyToken, requireAdmin, async (req, res) => {
  try {
    // Database connection test
    const dbTest = await db.query('SELECT NOW()');
    const dbStatus = dbTest.rows.length > 0 ? 'healthy' : 'unhealthy';

    // Get database stats
    const dbStatsQuery = `
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes
      FROM pg_stat_user_tables
      ORDER BY schemaname, tablename
    `;
    const dbStats = await db.query(dbStatsQuery);

    // Get recent error logs (if you implement error logging)
    const recentErrors = []; // Placeholder for error logs

    const health = {
      status: 'healthy',
      timestamp: new Date(),
      database: {
        status: dbStatus,
        stats: dbStats.rows
      },
      recentErrors,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    };

    res.json({
      success: true,
      health
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      health: {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      }
    });
  }
});

// Bulk operations
router.post('/bulk/update-order-status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { order_ids, status, admin_notes } = req.body;

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'Order IDs array is required' });
    }

    if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const results = [];
    for (const orderId of order_ids) {
      try {
        const updatedOrder = await Order.updateStatus(orderId, status, admin_notes);
        results.push({ orderId, success: true, order: updatedOrder });
      } catch (error) {
        results.push({ orderId, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      message: 'Bulk update completed',
      results
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export data
router.get('/export/:type', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const { start_date, end_date, format = 'json' } = req.query;

    let data = [];
    let filename = '';

    switch (type) {
      case 'orders':
        const filters = {};
        if (start_date) filters.start_date = start_date;
        if (end_date) filters.end_date = end_date;
        data = await Order.getAll(filters);
        filename = `orders_export_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'users':
        data = await User.getAll(1000, 0); // Get up to 1000 users
        filename = `users_export_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'products':
        data = await Product.getAll({ limit: 1000 });
        filename = `products_export_${new Date().toISOString().split('T')[0]}`;
        break;

      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    if (format === 'csv') {
      // Convert to CSV (basic implementation)
      if (data.length === 0) {
        return res.status(404).json({ error: 'No data to export' });
      }

      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row =>
        Object.values(row).map(value =>
          typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
        ).join(',')
      );

      const csv = [headers, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data,
        count: data.length,
        exportedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Database optimization endpoint
router.post('/optimize-database', verifyToken, requireAdmin, async (req, res) => {
  try {
    console.log('Admin database optimization requested by:', req.user.email);
    
    // Run the database optimization script
    const optimizeDatabase = require('../scripts/optimize-database');
    await optimizeDatabase();
    
    res.json({
      success: true,
      message: 'Database optimization completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database optimization error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Database optimization failed',
      details: error.message 
    });
  }
});

// Apply vendor access control migration endpoint
router.post('/apply-vendor-access-control', verifyToken, requireAdmin, async (req, res) => {
  try {
    console.log('Admin vendor access control migration requested by:', req.user.email);
    
    // Run the vendor access control migration
    const applyVendorAccessControl = require('../scripts/apply-vendor-access-control');
    await applyVendorAccessControl();
    
    res.json({
      success: true,
      message: 'Vendor access control migration completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Vendor access control migration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Vendor access control migration failed',
      details: error.message 
    });
  }
});

// Get all vendors with stats (admin only)
router.get('/vendors', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;

    let query = `
      SELECT 
        u.id, u.email, u.name, u.phone, u.role, u.is_active, 
        u.can_add_products, u.created_at, u.updated_at,
        COUNT(DISTINCT p.id) as total_products,
        COUNT(DISTINCT CASE WHEN p.is_active = true THEN p.id END) as active_products,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(DISTINCT oi.quantity * oi.price), 0) as total_revenue
      FROM users u
      LEFT JOIN products p ON u.id = p.vendor_id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed'
      WHERE u.role = 'vendor'
    `;

    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += `
      GROUP BY u.id, u.email, u.name, u.phone, u.role, u.is_active, 
               u.can_add_products, u.created_at, u.updated_at
      ORDER BY u.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    const vendors = result.rows.map(vendor => ({
      ...vendor,
      vendor_stats: {
        total_products: parseInt(vendor.total_products),
        active_products: parseInt(vendor.active_products),
        total_orders: parseInt(vendor.total_orders),
        total_revenue: parseFloat(vendor.total_revenue)
      }
    }));

    res.json({
      success: true,
      vendors,
      count: vendors.length
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor requests (admin only)
router.get('/vendor-requests', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status = 'all' } = req.query;

    let query = `
      SELECT 
        vr.id, vr.user_id, vr.business_name, vr.business_type, 
        vr.description, vr.status, vr.created_at, vr.updated_at,
        u.name, u.email, u.phone
      FROM vendor_requests vr
      JOIN users u ON vr.user_id = u.id
    `;

    const params = [];
    let paramCount = 0;

    if (status !== 'all') {
      paramCount++;
      query += ` WHERE vr.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY vr.created_at DESC`;

    const result = await db.query(query, params);

    const requests = result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      business_name: row.business_name,
      business_type: row.business_type,
      description: row.description,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user: {
        name: row.name,
        email: row.email,
        phone: row.phone
      }
    }));

    res.json({
      success: true,
      requests,
      count: requests.length
    });
  } catch (error) {
    console.error('Get vendor requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve vendor request (admin only) - with real-time notification
router.post('/vendor-requests/:id/approve', verifyToken, requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { admin_notes } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    // Get the request
    const requestQuery = 'SELECT * FROM vendor_requests WHERE id = $1';
    const requestResult = await db.query(requestQuery, [requestId]);

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    // Update request status
    await db.query(
      'UPDATE vendor_requests SET status = $1, admin_notes = $2, updated_at = NOW() WHERE id = $3',
      ['approved', admin_notes, requestId]
    );

    // Update user role to vendor
    await db.query(
      'UPDATE users SET role = \'vendor\', is_active = true, can_add_products = true WHERE id = $1',
      [request.user_id]
    );

    // Create database notification for approved vendor
    try {
      await Notification.create({
        user_id: request.user_id,
        type: 'vendor_approved',
        title: '🎉 Vendor Application Approved!',
        message: 'Congratulations! Your vendor application has been approved. You can now start adding products to the marketplace and manage your store.',
        data: {
          business_name: request.business_name,
          admin_notes: admin_notes || null,
          approved_at: new Date().toISOString()
        }
      });

      // Send real-time Socket.IO notification
      if (global.socketHandler) {
        global.socketHandler.notifyUser(request.user_id, 'vendor:approved', {
          message: '🎉 Your vendor application has been approved!',
          business_name: request.business_name,
          admin_notes: admin_notes || null,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ Vendor application approved for user ${request.user_id}`);
    } catch (notifError) {
      console.error('Vendor approval notification error:', notifError);
    }

    res.json({
      success: true,
      message: 'Vendor request approved successfully'
    });
  } catch (error) {
    console.error('Approve vendor request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject vendor request (admin only) - with real-time notification
router.post('/vendor-requests/:id/reject', verifyToken, requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { admin_notes } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    // Get the request
    const requestQuery = 'SELECT * FROM vendor_requests WHERE id = $1';
    const requestResult = await db.query(requestQuery, [requestId]);

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    // Update request status
    await db.query(
      'UPDATE vendor_requests SET status = $1, admin_notes = $2, updated_at = NOW() WHERE id = $3',
      ['rejected', admin_notes, requestId]
    );

    // Create database notification for rejected applicant
    try {
      await Notification.create({
        user_id: request.user_id,
        type: 'vendor_rejected',
        title: 'Vendor Application Not Approved',
        message: admin_notes 
          ? `Unfortunately, your vendor application has been rejected. Reason: ${admin_notes}. You can contact support for more information.`
          : 'Unfortunately, your vendor application has been rejected. Please contact support for more information.',
        data: {
          business_name: request.business_name,
          admin_notes: admin_notes || null,
          rejected_at: new Date().toISOString()
        }
      });

      // Send real-time Socket.IO notification
      if (global.socketHandler) {
        global.socketHandler.notifyUser(request.user_id, 'vendor:rejected', {
          message: '❌ Your vendor application was not approved',
          business_name: request.business_name,
          admin_notes: admin_notes || null,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`❌ Vendor application rejected for user ${request.user_id}`);
    } catch (notifError) {
      console.error('Vendor rejection notification error:', notifError);
    }

    res.json({
      success: true,
      message: 'Vendor request rejected successfully'
    });
  } catch (error) {
    console.error('Reject vendor request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle vendor status (admin only) - Enable/Disable vendor with real-time notifications
router.put('/vendors/:id/toggle-status', verifyToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Toggle vendor status endpoint hit');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Requesting user:', req.user);
    
    const vendorId = parseInt(req.params.id);
    const { is_active, admin_notes } = req.body;

    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean value' });
    }

    // Get current user status - allow vendors OR users with can_add_products permission
    const vendorQuery = 'SELECT * FROM users WHERE id = $1 AND (role = \'vendor\' OR can_add_products = true)';
    const vendorResult = await db.query(vendorQuery, [vendorId]);
    
    if (vendorResult.rows.length === 0) {
      console.log('❌ Vendor not found for ID:', vendorId);
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const currentVendor = vendorResult.rows[0];
    console.log('✅ Found vendor:', currentVendor);

    // Update vendor status in database
    const updateQuery = `
      UPDATE users 
      SET is_active = $1, updated_at = NOW() 
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, [is_active, vendorId]);
    const vendor = result.rows[0];

    // If deactivating, also deactivate all vendor's products
    if (!is_active) {
      await db.query(
        'UPDATE products SET is_active = false WHERE vendor_id = $1',
        [vendorId]
      );
    }

    // Create database notification for vendor
    try {
      const Notification = require('../models/Notification');
      await Notification.create({
        user_id: vendorId,
        type: 'vendor_status',
        title: is_active ? 'Vendor Account Activated' : 'Vendor Account Temporarily Disabled',
        message: is_active 
          ? 'Your vendor account has been activated! You can now manage products and receive orders.'
          : 'Your vendor account has been temporarily disabled by the admin. You cannot manage products until reactivated. Please contact support for assistance.',
        data: {
          is_active,
          admin_notes: admin_notes || null,
          admin_id: req.user.id,
          previous_status: currentVendor.is_active,
          changed_at: new Date().toISOString()
        }
      });

      // Send real-time Socket.IO notification to vendor
      if (global.socketHandler) {
        global.socketHandler.notifyUser(vendorId, 'vendor:status_changed', {
          is_active,
          message: is_active 
            ? '✅ Your vendor account has been activated!'
            : '⚠️ Your vendor account has been temporarily disabled',
          admin_notes: admin_notes || null,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ Vendor ${vendor.name} ${is_active ? 'activated' : 'disabled'} - notification sent`);
    } catch (notifError) {
      console.error('Vendor status notification error:', notifError);
      // Don't fail the main operation if notification fails
    }

    res.json({
      success: true,
      message: `Vendor ${is_active ? 'activated' : 'deactivated'} successfully`,
      vendor
    });
  } catch (error) {
    console.error('Toggle vendor status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke vendor approval (admin only)
router.put('/vendors/:id/revoke-approval', verifyToken, requireAdmin, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    const { admin_notes } = req.body;

    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    if (!admin_notes || !admin_notes.trim()) {
      return res.status(400).json({ error: 'Admin notes are required for approval revocation' });
    }

    // Update user role back to customer and deactivate
    const updateQuery = `
      UPDATE users 
      SET role = 'customer', is_active = true, can_add_products = false, updated_at = NOW() 
      WHERE id = $1 AND role = 'vendor'
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, [vendorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const vendor = result.rows[0];

    // Deactivate all vendor's products
    await db.query(
      'UPDATE products SET is_active = false WHERE vendor_id = $1',
      [vendorId]
    );

    // Update any pending vendor requests to rejected
    await db.query(
      'UPDATE vendor_requests SET status = $1, admin_notes = $2, updated_at = NOW() WHERE user_id = $3 AND status = $4',
      ['rejected', `Approval revoked: ${admin_notes}`, vendorId, 'approved']
    );

    res.json({
      success: true,
      message: 'Vendor approval revoked successfully',
      vendor
    });
  } catch (error) {
    console.error('Revoke vendor approval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle product access for any user (admin only)
router.put('/users/:id/product-access', verifyToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { can_add_products, admin_notes } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Update user product access
    const updateQuery = `
      UPDATE users 
      SET can_add_products = $1, updated_at = NOW() 
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, [can_add_products, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // If revoking access, deactivate all user's products
    if (!can_add_products) {
      await db.query(
        'UPDATE products SET is_active = false WHERE vendor_id = $1',
        [userId]
      );
    }

    // Send real-time notification to user about product access change
    try {
      await Notification.create({
        user_id: userId,
        type: 'product_access',
        title: can_add_products ? 'Product Access Granted' : 'Product Access Revoked',
        message: can_add_products 
          ? 'You can now add and manage products in the marketplace.'
          : 'Your product access has been revoked. Your existing products have been deactivated.',
        data: {
          can_add_products,
          admin_notes: admin_notes || null,
          admin_id: req.user.id
        }
      });

      // Send Socket.IO notification
      if (global.socketHandler) {
        global.socketHandler.notifyUser(userId, 'product_access_changed', {
          can_add_products,
          message: can_add_products 
            ? '🎉 You can now add products!'
            : '⚠️ Your product access has been revoked',
          timestamp: new Date().toISOString()
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.json({
      success: true,
      message: `Product access ${can_add_products ? 'granted' : 'revoked'} successfully`,
      user
    });
  } catch (error) {
    console.error('Toggle product access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create notification (admin only)
router.post('/notifications/create', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, type, title, message, admin_notes } = req.body;

    if (!user_id || !type || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const notification = await Notification.create({
      user_id: parseInt(user_id),
      type,
      title,
      message,
      data: {
        admin_notes: admin_notes || null,
        created_by_admin: req.user.id
      }
    });

    res.json({
      success: true,
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple vendor toggle without notifications (for debugging)
router.put('/vendors/:id/simple-toggle', verifyToken, requireAdmin, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    const { is_active, admin_notes } = req.body;

    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean value' });
    }

    // Simple update without notifications
    const updateQuery = `
      UPDATE users 
      SET is_active = $1, updated_at = NOW() 
      WHERE id = $2 AND (role = 'vendor' OR can_add_products = true)
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, [is_active, vendorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const vendor = result.rows[0];

    // If deactivating, also deactivate all vendor's products
    if (!is_active) {
      await db.query(
        'UPDATE products SET is_active = false WHERE vendor_id = $1',
        [vendorId]
      );
    }

    res.json({
      success: true,
      message: `Vendor ${is_active ? 'activated' : 'deactivated'} successfully`,
      vendor
    });
  } catch (error) {
    console.error('Simple toggle vendor status error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Database health check endpoint
router.get('/database-health', verifyToken, requireAdmin, async (req, res) => {
  try {
    const healthChecks = [];
    
    // Check table existence
    const tables = ['users', 'products', 'orders', 'notifications', 'vendor_requests', 'categories'];
    for (const table of tables) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        healthChecks.push({
          check: `${table}_table`,
          status: 'healthy',
          count: parseInt(result.rows[0].count)
        });
      } catch (error) {
        healthChecks.push({
          check: `${table}_table`,
          status: 'error',
          error: error.message
        });
      }
    }
    
    // Check indexes
    try {
      const indexResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
      `);
      healthChecks.push({
        check: 'indexes',
        status: 'healthy',
        count: parseInt(indexResult.rows[0].count)
      });
    } catch (error) {
      healthChecks.push({
        check: 'indexes',
        status: 'error',
        error: error.message
      });
    }
    
    // Check vendor analytics view
    try {
      const viewResult = await db.query('SELECT COUNT(*) as count FROM vendor_analytics');
      healthChecks.push({
        check: 'vendor_analytics_view',
        status: 'healthy',
        count: parseInt(viewResult.rows[0].count)
      });
    } catch (error) {
      healthChecks.push({
        check: 'vendor_analytics_view',
        status: 'error',
        error: error.message
      });
    }
    
    const overallHealth = healthChecks.every(check => check.status === 'healthy') ? 'healthy' : 'degraded';
    
    res.json({
      success: true,
      overall_health: overallHealth,
      checks: healthChecks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database health check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Health check failed',
      details: error.message 
    });
  }
});

module.exports = router;
