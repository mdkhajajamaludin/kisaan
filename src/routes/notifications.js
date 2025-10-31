const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');
const Joi = require('joi');

// Validation schemas
const markAsReadSchema = Joi.object({
  notification_ids: Joi.array().items(Joi.number().integer().positive()).optional()
});

// Get user notifications - Optimized for speed
router.get('/', verifyToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, unread_only = false } = req.query;

    // Parallel execution for lightning-fast response
    const [notifications, unreadCount] = await Promise.all([
      Notification.findByUserId(req.user.id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        unreadOnly: unread_only === 'true'
      }),
      Notification.getUnreadCount(req.user.id)
    ]);

    // Set cache headers for better performance
    res.set('Cache-Control', 'private, max-age=10'); // Cache for 10 seconds

    res.json({
      success: true,
      notifications,
      unread_count: unreadCount,
      total: notifications.length
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's own notifications (my-notifications endpoint)
router.get('/my-notifications', verifyToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, unread_only = false } = req.query;

    // Use the same logic as the main endpoint
    const [notifications, unreadCount] = await Promise.all([
      Notification.findByUserId(req.user.id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        unreadOnly: unread_only === 'true'
      }),
      Notification.getUnreadCount(req.user.id)
    ]);

    res.json({
      success: true,
      notifications,
      unread_count: unreadCount,
      total: notifications.length
    });
  } catch (error) {
    console.error('Get my-notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count only - Ultra-fast endpoint
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const unreadCount = await Notification.getUnreadCount(req.user.id);

    // Aggressive caching for unread count (5 seconds)
    res.set('Cache-Control', 'private, max-age=5');

    res.json({
      success: true,
      unread_count: unreadCount
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark notification(s) as read
router.put('/mark-read', verifyToken, async (req, res) => {
  try {
    const { error, value } = markAsReadSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { notification_ids } = value;

    if (notification_ids && notification_ids.length > 0) {
      // Mark specific notifications as read
      const results = [];
      for (const notificationId of notification_ids) {
        const result = await Notification.markAsRead(notificationId, req.user.id);
        if (result) {
          results.push(result);
        }
      }

      res.json({
        success: true,
        message: `${results.length} notifications marked as read`,
        updated_notifications: results
      });
    } else {
      // Mark all notifications as read
      const result = await Notification.markAllAsRead(req.user.id);
      
      res.json({
        success: true,
        message: `${result.updated_count} notifications marked as read`,
        updated_count: result.updated_count
      });
    }
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark single notification as read
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    const notification = await Notification.markAsRead(notificationId, req.user.id);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    const notification = await Notification.delete(notificationId, req.user.id);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear all notifications
router.delete('/', verifyToken, async (req, res) => {
  try {
    const result = await Notification.deleteAll(req.user.id);
    
    res.json({
      success: true,
      message: `${result.deleted_count} notifications cleared`,
      deleted_count: result.deleted_count
    });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Send notification to user
router.post('/send', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, type, title, message, data = {} } = req.body;

    if (!user_id || !type || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const notification = await Notification.create({
      user_id,
      type,
      title,
      message,
      data
    });

    res.json({
      success: true,
      message: 'Notification sent successfully',
      notification
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Create notification (alternative endpoint)
router.post('/create', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, type, title, message, admin_notes, data = {} } = req.body;

    if (!user_id || !type || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Include admin_notes in the data if provided
    const notificationData = { ...data };
    if (admin_notes) {
      notificationData.admin_notes = admin_notes;
    }

    const notification = await Notification.create({
      user_id,
      type,
      title,
      message,
      data: notificationData
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

// Admin: Cleanup old notifications
router.post('/cleanup', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { days_old = 30 } = req.body;
    
    const result = await Notification.cleanup(days_old);
    
    res.json({
      success: true,
      message: `${result.deleted_count} old notifications cleaned up`,
      deleted_count: result.deleted_count
    });
  } catch (error) {
    console.error('Cleanup notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;