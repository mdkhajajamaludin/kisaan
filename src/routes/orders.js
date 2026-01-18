const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin, requireOwnershipOrAdmin } = require('../middleware/roles');
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
    phone: Joi.string().required()
  }).required(),
  payment_method: Joi.string().valid('card', 'upi', 'cod').required(),
  notes: Joi.string().optional()
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled').required(),
  admin_notes: Joi.string().optional()
});

// Get user's orders
router.get('/', verifyToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;

    const filters = { user_id: req.user.id };
    if (status && status !== 'all') filters.status = status;

    const paginationOptions = {
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0
    };

    const result = await Order.getAll(filters, paginationOptions);

    console.log('API /orders result:', {
      ordersCount: result.orders?.length,
      pagination: result.pagination
    });

    res.json({
      success: true,
      orders: result.orders,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order by ID
router.get('/:id', verifyToken, requireOwnershipOrAdmin(async (req) => {
  const order = await Order.findById(parseInt(req.params.id));
  return order ? order.user_id : null;
}), async (req, res) => {
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
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create new order
router.post('/', verifyToken, async (req, res) => {
  try {
    const { error, value } = createOrderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Calculate total amount
    const totalAmount = value.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    const orderData = {
      user_id: req.user.id,
      items: value.items,
      total_amount: totalAmount,
      shipping_address: value.shipping_address,
      payment_method: value.payment_method,
      notes: value.notes || null,
      status: 'pending'
    };

    const order = await Order.create(orderData);

    // Get order items for notification
    const orderItems = await Order.getOrderItems(order.id);

    // Create simple admin notification for new order
    try {
      // Get all admin users
      const adminResult = await db.query("SELECT id FROM users WHERE role = 'admin'");

      if (adminResult.rows.length > 0) {
        for (const adminRow of adminResult.rows) {
          const adminId = adminRow.id;

          // Create database notification for admin
          await Notification.create({
            user_id: adminId,
            type: 'order',
            title: 'New Order Received!',
            message: `New order #${order.id} for ₹${order.total_amount.toFixed(2)} from ${req.user.name}`,
            data: {
              order_id: order.id,
              customer_name: req.user.name,
              customer_email: req.user.email,
              total_amount: order.total_amount,
              order_status: order.status
            }
          });

          // Send real-time notification to admin
          if (global.io && global.socketHandler) {
            global.socketHandler.notifyUser(adminId, 'admin:new_order', {
              order_id: order.id,
              customer_name: req.user.name,
              total_amount: order.total_amount,
              order_status: order.status,
              message: `New order received!`,
              timestamp: new Date().toISOString()
            });
          }
        }

        console.log(`✅ Admin notifications sent for order #${order.id} to ${adminResult.rows.length} admins`);
      }
    } catch (notificationError) {
      console.error('Error sending admin notification:', notificationError);
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Update order status (admin only)
router.put('/:id/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const { error, value } = updateOrderStatusSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const order = await Order.updateStatus(orderId, value.status, value.admin_notes);

    // Notify customer about status change
    try {
      await Notification.create({
        user_id: order.user_id,
        type: 'order_status',
        title: `Order ${value.status.charAt(0).toUpperCase() + value.status.slice(1)}`,
        message: `Your order #${order.id} has been ${value.status}`,
        data: {
          order_id: order.id,
          new_status: value.status,
          admin_notes: value.admin_notes
        }
      });

      // Send real-time notification to customer
      if (global.io && global.socketHandler) {
        global.socketHandler.notifyUser(order.user_id, 'order:status_updated', {
          order_id: order.id,
          new_status: value.status,
          message: `Your order has been ${value.status}`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (notificationError) {
      console.error('Error sending status update notification:', notificationError);
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Cancel order (user can cancel their own pending orders)
router.put('/:id/cancel', verifyToken, requireOwnershipOrAdmin(async (req) => {
  const order = await Order.findById(parseInt(req.params.id));
  return order ? order.user_id : null;
}), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only allow cancellation of pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({
        error: 'Order cannot be cancelled',
        message: `Orders with status '${order.status}' cannot be cancelled`
      });
    }

    const updatedOrder = await Order.updateStatus(orderId, 'cancelled', 'Cancelled by customer');

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

module.exports = router;