const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin, requireOwnershipOrAdmin } = require('../middleware/roles');
const { requireActiveVendor, requireVendorOrderAccess } = require('../middleware/vendorAccess');
const emailService = require('../services/emailService');
const Joi = require('joi');

// Validation schemas
const createOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.number().integer().positive().required(),
      quantity: Joi.number().integer().positive().required(),
      price: Joi.number().positive().required()
    })
  ).min(1).required(),
  shipping_address: Joi.object({
    name: Joi.string().required(),
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zip_code: Joi.string().required(),
    country: Joi.string().required(),
    phone: Joi.string().optional()
  }).required(),
  payment_method: Joi.string().required(),
  notes: Joi.string().optional()
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered', 'cancelled').required(),
  admin_notes: Joi.string().optional()
});

// Helper function to get order user ID
const getOrderUserId = async (req) => {
  const order = await Order.findById(req.params.id);
  return order ? order.user_id : null;
};

// Get user's orders
router.get('/', verifyToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;

    let orders;
    if (req.user.role === 'admin') {
      // Admin can see all orders
      const filters = {};
      if (status) filters.status = status;
      if (limit) filters.limit = parseInt(limit);
      if (offset) filters.offset = parseInt(offset);

      orders = await Order.getAll(filters);
    } else {
      // Users can only see their own orders
      orders = await Order.getByUser(req.user.id, parseInt(limit), parseInt(offset));

      // Filter by status if provided
      if (status) {
        orders = orders.filter(order => order.status === status);
      }
    }

    res.json({
      success: true,
      orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new order with vendor notifications
router.post('/', verifyToken, async (req, res) => {
  try {
    const { error, value } = createOrderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Calculate total amount
    const totalAmount = value.items.reduce((sum, item) => {
      return sum + (item.quantity * item.price);
    }, 0);

    const orderData = {
      user_id: req.user.id,
      total_amount: totalAmount,
      ...value
    };

    const order = await Order.create(orderData);
    const orderItems = await Order.getOrderItems(order.id);

    // Get vendor information for each product in the order
    const vendorNotifications = new Map();

    for (const item of orderItems) {
      try {
        // Get product and vendor info
        const productQuery = `
          SELECT p.vendor_id, p.name as product_name, u.name as vendor_name, u.email as vendor_email
          FROM products p
          JOIN users u ON p.vendor_id = u.id
          WHERE p.id = $1
        `;
        const productResult = await db.query(productQuery, [item.product_id]);

        if (productResult.rows.length > 0) {
          const { vendor_id, product_name, vendor_name, vendor_email } = productResult.rows[0];

          if (!vendorNotifications.has(vendor_id)) {
            vendorNotifications.set(vendor_id, {
              vendor_name,
              vendor_email,
              products: [],
              total_amount: 0
            });
          }

          const vendorData = vendorNotifications.get(vendor_id);
          vendorData.products.push({
            name: product_name,
            quantity: item.quantity,
            price: item.price,
            total: item.quantity * item.price
          });
          vendorData.total_amount += item.quantity * item.price;
        }
      } catch (vendorError) {
        console.error('Error getting vendor info for product:', item.product_id, vendorError);
      }
    }

    // Send notifications to each vendor (including admin if they added products)
    for (const [vendorId, vendorData] of vendorNotifications) {
      try {
        // Get vendor/admin user info
        const vendorUser = await User.findById(vendorId);
        const isAdmin = vendorUser && vendorUser.role === 'admin';

        // Create database notification
        await Notification.create({
          user_id: vendorId,
          type: 'order',
          title: isAdmin ? 'New Order for Your Product!' : 'New Order Received!',
          message: isAdmin 
            ? `You have received a new order #${order.id} for ₹${vendorData.total_amount.toFixed(2)} from ${req.user.name} for products you added`
            : `You have received a new order #${order.id} for ₹${vendorData.total_amount.toFixed(2)} from ${req.user.name}`,
          data: {
            order_id: order.id,
            customer_name: req.user.name,
            customer_email: req.user.email,
            total_amount: vendorData.total_amount,
            products: vendorData.products,
            order_status: order.status,
            is_admin_product: isAdmin
          }
        });

        // Send real-time notification via Socket.IO to specific vendor/admin only
        if (global.io && global.socketHandler) {
          if (isAdmin) {
            // Send to admin with special event
            global.socketHandler.notifyUser(vendorId, 'admin:product_order', {
              order_id: order.id,
              customer_name: req.user.name,
              customer_email: req.user.email,
              total_amount: vendorData.total_amount,
              products: vendorData.products,
              order_status: order.status,
              message: `New order for products you added!`,
              timestamp: new Date().toISOString()
            });
          } else {
            // Send to vendor
            global.socketHandler.notifyVendorNewOrder(vendorId, {
              order_id: order.id,
              customer_name: req.user.name,
              customer_email: req.user.email,
              total_amount: vendorData.total_amount,
              products: vendorData.products,
              order_status: order.status,
              timestamp: new Date().toISOString()
            });
          }
        }

        console.log(`✅ Notification sent to ${isAdmin ? 'admin' : 'vendor'} ${vendorData.vendor_name} for order #${order.id}`);
      } catch (notificationError) {
        console.error('Error sending vendor notification:', notificationError);
        // Don't fail order creation if notification fails
      }
    }

    // Send order confirmation email to customer
    try {
      await emailService.sendOrderConfirmationEmail(
        req.user.email,
        req.user.name,
        order,
        orderItems
      );
    } catch (emailError) {
      console.error('Order confirmation email error:', emailError);
      // Don't fail order creation if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        ...order,
        items: orderItems
      },
      vendors_notified: vendorNotifications.size
    });
  } catch (error) {
    console.error('Create order error:', error);

    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single order with items
router.get('/:id', verifyToken, requireOwnershipOrAdmin(getOrderUserId), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const order = await Order.getOrderWithItems(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (admin only)
// Update order status (admin only) - Modern real-time status management
router.put('/:id/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Update order status request:', req.params.id, req.body);

    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const { error, value } = updateStatusSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details[0].message);
      return res.status(400).json({ error: error.details[0].message });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('⏳ Updating order status in database:', orderId, value.status, value.admin_notes);
    
    // Update order status in database - REAL-TIME DATABASE SAVE
    const updatedOrder = await Order.updateStatus(orderId, value.status, value.admin_notes);
    
    if (!updatedOrder) {
      console.error('❌ Order update failed - no order returned');
      return res.status(500).json({ error: 'Failed to update order status' });
    }

    console.log('✅ Order status updated in database successfully');

    // Create notification in database for customer - REAL-TIME DATABASE SAVE
    try {
      await Notification.create({
        user_id: order.user_id,
        type: 'order_update',
        title: 'Order Status Updated',
        message: `Your order #${orderId} status has been updated to "${value.status}"`,
        data: {
          order_id: orderId,
          new_status: value.status,
          admin_notes: value.admin_notes,
          updated_by: 'admin',
          updated_at: new Date().toISOString()
        }
      });

      console.log('✅ Notification saved to database for customer');

      // Send real-time Socket.IO notification to customer
      if (global.io && global.socketHandler) {
        global.socketHandler.notifyCustomerOrderUpdate(order.user_id, {
          order_id: orderId,
          new_status: value.status,
          admin_notes: value.admin_notes,
          timestamp: new Date().toISOString()
        });
        console.log('🔔 Real-time Socket.IO notification sent to customer');
      }
    } catch (notificationError) {
      console.error('⚠️ Customer notification error:', notificationError);
      // Don't fail order update if notification fails
    }

    // Send status update email to customer (optional)
    try {
      const customer = await User.findById(order.user_id);
      if (customer && emailService && emailService.sendOrderStatusUpdateEmail) {
        await emailService.sendOrderStatusUpdateEmail(
          customer.email,
          customer.name,
          updatedOrder,
          value.status
        );
        console.log('📧 Email sent to customer');
      }
    } catch (emailError) {
      console.error('⚠️ Email error:', emailError.message);
      // Don't fail status update if email fails
    }

    console.log('🎉 Order status update completed successfully!');

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('❌ Update order status error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Cancel order (customer can cancel pending orders, admin can cancel any)
router.put('/:id/cancel', verifyToken, requireOwnershipOrAdmin(getOrderUserId), async (req, res) => {
  try {
    console.log('Cancel order request:', req.params.id, req.body);

    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only allow cancellation of pending or processing orders
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({
        error: 'Order cannot be cancelled in current status',
        currentStatus: order.status
      });
    }

    const cancelReason = req.body.reason || 'Cancelled by user';
    
    // Update order status to cancelled in database - REAL-TIME DATABASE SAVE
    const updatedOrder = await Order.updateStatus(orderId, 'cancelled', cancelReason);

    console.log('✅ Order cancelled in database successfully');

    // Create cancellation notification in database for customer - REAL-TIME DATABASE SAVE
    try {
      await Notification.create({
        user_id: order.user_id,
        type: 'order_cancelled',
        title: 'Order Cancelled',
        message: `Your order #${orderId} has been cancelled. Reason: ${cancelReason}`,
        data: {
          order_id: orderId,
          status: 'cancelled',
          cancel_reason: cancelReason,
          cancelled_by: req.user.role === 'admin' ? 'admin' : 'customer',
          cancelled_at: new Date().toISOString()
        }
      });

      console.log('✅ Cancellation notification saved to database');

      // Send real-time Socket.IO notification
      if (global.io && global.socketHandler) {
        global.socketHandler.notifyCustomerOrderUpdate(order.user_id, {
          order_id: orderId,
          new_status: 'cancelled',
          cancel_reason: cancelReason,
          cancelled_by: req.user.role === 'admin' ? 'admin' : 'customer',
          timestamp: new Date().toISOString()
        });
        console.log('🔔 Real-time cancellation notification sent via Socket.IO');
      }
    } catch (notificationError) {
      console.error('⚠️ Cancellation notification error:', notificationError);
    }

    // Send cancellation email to customer (optional)
    try {
      const customer = await User.findById(order.user_id);
      if (customer && emailService && emailService.sendOrderStatusUpdateEmail) {
        await emailService.sendOrderStatusUpdateEmail(
          customer.email,
          customer.name,
          updatedOrder,
          'cancelled'
        );
        console.log('📧 Cancellation email sent to customer');
      }
    } catch (emailError) {
      console.error('⚠️ Email error:', emailError.message);
    }

    console.log('🎉 Order cancellation completed successfully!');

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order analytics (admin only)
router.get('/analytics/summary', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = end_date ? new Date(end_date) : new Date();

    const analytics = await Order.getAnalytics(startDate, endDate);

    res.json({
      success: true,
      analytics: {
        ...analytics,
        period: {
          start_date: startDate,
          end_date: endDate
        }
      }
    });
  } catch (error) {
    console.error('Order analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor orders (vendor can see orders containing their products)
router.get('/vendor/orders', verifyToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user has vendor access or is admin
    if (req.user.role !== 'admin' && req.user.role !== 'vendor' && !req.user.can_add_products) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You need vendor access or product permissions to view orders'
      });
    }
    
    const { limit = 20, offset = 0 } = req.query;
    
    // Vendors can only see their own orders, admins can specify vendor_id
    const vendorId = req.user.role === 'admin' ? (req.query.vendor_id || req.user.id) : req.user.id;

    const orders = await Order.getVendorOrders(parseInt(vendorId), parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Get vendor orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor's own orders (my-orders endpoint)
router.get('/vendor/my-orders', verifyToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user has vendor access or is admin
    if (req.user.role !== 'admin' && req.user.role !== 'vendor' && !req.user.can_add_products) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You need vendor access or product permissions to view orders'
      });
    }
    
    const { limit = 20, offset = 0, status } = req.query;
    
    // Vendors can only see their own orders
    const vendorId = req.user.role === 'admin' ? (req.query.vendor_id || req.user.id) : req.user.id;

    let query = `
      SELECT DISTINCT o.id, o.total_amount, o.status, o.created_at, o.updated_at,
             o.shipping_address, o.notes, o.payment_method,
             u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             json_agg(
               json_build_object(
                 'product_id', p.id,
                 'product_name', p.name,
                 'quantity', oi.quantity,
                 'price', oi.price,
                 'product_image', CASE 
                   WHEN p.images IS NOT NULL AND p.images != '[]' 
                   THEN (p.images::json->>0) 
                   ELSE NULL 
                 END
               ) ORDER BY oi.id
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
               o.shipping_address, o.notes, o.payment_method, u.name, u.email, u.phone
      ORDER BY o.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Process shipping address for each order
    const processedOrders = result.rows.map(order => {
      let shippingAddress = '';
      try {
        if (typeof order.shipping_address === 'string') {
          const addr = JSON.parse(order.shipping_address);
          shippingAddress = `${addr.name}, ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip_code}`;
        } else if (typeof order.shipping_address === 'object') {
          const addr = order.shipping_address;
          shippingAddress = `${addr.name}, ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip_code}`;
        }
      } catch (error) {
        console.error('Error parsing shipping address:', error);
        shippingAddress = order.shipping_address || '';
      }

      return {
        ...order,
        shipping_address: shippingAddress
      };
    });

    res.json({
      success: true,
      orders: processedOrders
    });
  } catch (error) {
    console.error('Get vendor my-orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent orders (admin dashboard)
router.get('/admin/recent', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const orders = await Order.getAll({
      limit: parseInt(limit),
      offset: 0
    });

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    console.error('Get recent orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vendor update order status (vendors can update orders containing their products)
router.put('/vendor/:id/status', verifyToken, requireVendorOrderAccess, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const { status, vendor_notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Verify vendor has products in this order
    const vendorCheckQuery = `
      SELECT DISTINCT o.id, o.status as current_status, u.name as customer_name
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND p.vendor_id = $2
    `;

    const vendorCheck = await db.query(vendorCheckQuery, [orderId, req.user.id]);

    if (vendorCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have permission to update this order' });
    }

    const order = vendorCheck.rows[0];

    // Update order status
    const updatedOrder = await Order.updateStatus(orderId, status, vendor_notes);

    // Create notification for customer
    try {
      await Notification.create({
        user_id: updatedOrder.user_id,
        type: 'order_update',
        title: 'Order Status Updated',
        message: `Your order #${orderId} has been updated to "${status}" by the vendor`,
        data: {
          order_id: orderId,
          new_status: status,
          vendor_notes: vendor_notes,
          updated_by: 'vendor'
        }
      });

      // Send real-time notification to customer only
      if (global.io && global.socketHandler) {
        global.socketHandler.notifyCustomerOrderUpdate(updatedOrder.user_id, {
          order_id: orderId,
          new_status: status,
          vendor_notes: vendor_notes,
          updated_by: 'vendor',
          timestamp: new Date().toISOString()
        });
      }
    } catch (notificationError) {
      console.error('Order update notification error:', notificationError);
    }

    // Send status update email to customer
    try {
      const customer = await User.findById(updatedOrder.user_id);
      if (customer) {
        await emailService.sendOrderStatusUpdateEmail(
          customer.email,
          customer.name,
          updatedOrder,
          status
        );
      }
    } catch (emailError) {
      console.error('Order status email error:', emailError);
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Vendor update order status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor order details with items
router.get('/vendor/:id/details', verifyToken, requireVendorOrderAccess, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    // Get order details with vendor's products only
    const orderQuery = `
      SELECT DISTINCT o.id, o.total_amount, o.status, o.created_at, o.updated_at,
             o.shipping_address, o.notes, o.payment_method, o.admin_notes,
             u.name as customer_name, u.email as customer_email, u.phone as customer_phone
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND p.vendor_id = $2
    `;

    const orderResult = await db.query(orderQuery, [orderId, req.user.id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or access denied' });
    }

    const order = orderResult.rows[0];

    // Get vendor's items in this order
    const itemsQuery = `
      SELECT oi.id, oi.quantity, oi.price, 
             p.id as product_id, p.name as product_name, p.images
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1 AND p.vendor_id = $2
    `;

    const itemsResult = await db.query(itemsQuery, [orderId, req.user.id]);

    // Process shipping address
    let shippingAddress = '';
    try {
      if (typeof order.shipping_address === 'string') {
        const addr = JSON.parse(order.shipping_address);
        shippingAddress = `${addr.name}, ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip_code}`;
      } else if (typeof order.shipping_address === 'object') {
        const addr = order.shipping_address;
        shippingAddress = `${addr.name}, ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip_code}`;
      }
    } catch (error) {
      shippingAddress = order.shipping_address || '';
    }

    res.json({
      success: true,
      order: {
        ...order,
        shipping_address: shippingAddress,
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Get vendor order details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple vendor orders endpoint that works for any authenticated user
router.get('/vendor/simple-orders', verifyToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    const { limit = 20, offset = 0, status } = req.query;
    
    let query = `
      SELECT DISTINCT o.id, o.total_amount, o.status, o.created_at, o.updated_at,
             o.shipping_address, o.notes, o.payment_method,
             u.name as customer_name, u.email as customer_email
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE p.vendor_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND o.status = $${paramCount}`;
      params.push(status);
    }

    query += `
      GROUP BY o.id, o.total_amount, o.status, o.created_at, o.updated_at,
               o.shipping_address, o.notes, o.payment_method, u.name, u.email
      ORDER BY o.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get order items separately to avoid JSON aggregation issues
    const orders = await Promise.all(result.rows.map(async (order) => {
      const itemsQuery = `
        SELECT p.id as product_id, p.name as product_name, oi.quantity, oi.price
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1 AND p.vendor_id = $2
        ORDER BY oi.id
      `;
      
      const itemsResult = await db.query(itemsQuery, [order.id, userId]);
      
      let shippingAddress = '';
      try {
        if (typeof order.shipping_address === 'string') {
          const addr = JSON.parse(order.shipping_address);
          shippingAddress = `${addr.name}, ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip_code}`;
        } else if (typeof order.shipping_address === 'object') {
          const addr = order.shipping_address;
          shippingAddress = `${addr.name}, ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip_code}`;
        }
      } catch (error) {
        console.error('Error parsing shipping address:', error);
        shippingAddress = order.shipping_address || '';
      }

      return {
        ...order,
        shipping_address: shippingAddress,
        items: itemsResult.rows
      };
    }));

    res.json({
      success: true,
      orders,
      user_info: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Simple vendor orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;