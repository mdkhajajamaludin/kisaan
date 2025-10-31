const db = require('../config/database');

class Notification {
  static async create(notificationData) {
    const {
      user_id,
      type,
      title,
      message,
      data = {}
    } = notificationData;

    const query = `
      INSERT INTO notifications (user_id, type, title, message, data, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await db.query(query, [
      user_id,
      type,
      title,
      message,
      JSON.stringify(data)
    ]);

    const notification = result.rows[0];
    console.log('✅ Notification created:', {
      id: notification.id,
      title: notification.title,
      created_at: notification.created_at,
      current_time: new Date().toISOString()
    });

    return notification;
  }

  static async findByUserId(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      unreadOnly = false
    } = options;

    // Optimized query using indexed columns
    let query = `
      SELECT
        id,
        user_id,
        type,
        title,
        message,
        data,
        read,
        created_at,
        read_at
      FROM notifications
      WHERE user_id = $1
    `;

    const params = [userId];

    if (unreadOnly) {
      // Uses idx_notifications_user_read partial index
      query += ' AND read = false';
    }

    // Uses idx_notifications_user_created composite index
    query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  static async markAsRead(notificationId, userId) {
    const query = `
      UPDATE notifications
      SET read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, [notificationId, userId]);
    return result.rows[0];
  }

  static async markAllAsRead(userId) {
    const query = `
      UPDATE notifications
      SET read = true, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND read = false
    `;

    const result = await db.query(query, [userId]);
    return { updated_count: result.rowCount || 0 };
  }

  static async delete(notificationId, userId) {
    const query = `
      DELETE FROM notifications
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, [notificationId, userId]);
    return result.rows[0];
  }

  static async deleteAll(userId) {
    const query = `
      DELETE FROM notifications
      WHERE user_id = $1
    `;

    const result = await db.query(query, [userId]);
    return { deleted_count: result.rowCount || 0 };
  }

  static async getUnreadCount(userId) {
    // Optimized query using idx_notifications_user_read partial index
    // This is extremely fast as it only scans the partial index
    const query = `
      SELECT COUNT(*) as unread_count
      FROM notifications
      WHERE user_id = $1 AND read = false
    `;

    const result = await db.query(query, [userId]);
    return parseInt(result.rows[0].unread_count);
  }

  static async createOrderNotification(userId, orderId, status, customMessage = null) {
    const statusMessages = {
      processing: {
        title: 'Order Confirmed!',
        message: customMessage || `Your order #${orderId} has been confirmed and is being processed.`
      },
      shipped: {
        title: 'Order Shipped!',
        message: customMessage || `Your order #${orderId} has been shipped and is on its way.`
      },
      delivered: {
        title: 'Order Delivered!',
        message: customMessage || `Your order #${orderId} has been delivered successfully.`
      },
      cancelled: {
        title: 'Order Cancelled',
        message: customMessage || `Your order #${orderId} has been cancelled.`
      }
    };

    const statusInfo = statusMessages[status];
    if (!statusInfo) {
      throw new Error(`Invalid order status: ${status}`);
    }

    return await this.create({
      user_id: userId,
      type: `order_${status}`,
      title: statusInfo.title,
      message: statusInfo.message,
      data: { order_id: orderId, status }
    });
  }

  static async createVendorNotification(userId, type, data = {}) {
    const vendorMessages = {
      application_submitted: {
        title: 'Vendor Application Submitted',
        message: 'Your vendor application has been submitted successfully. We will review it and get back to you soon.'
      },
      application_approved: {
        title: 'Vendor Application Approved!',
        message: 'Congratulations! Your vendor application has been approved. You can now start selling on our platform.'
      },
      application_rejected: {
        title: 'Vendor Application Update',
        message: 'Your vendor application has been reviewed. Please check your email for more details.'
      },
      product_approved: {
        title: 'Product Approved',
        message: `Your product "${data.product_name}" has been approved and is now live on the platform.`
      },
      product_rejected: {
        title: 'Product Review Required',
        message: `Your product "${data.product_name}" needs some updates before it can be published.`
      }
    };

    const messageInfo = vendorMessages[type];
    if (!messageInfo) {
      throw new Error(`Invalid vendor notification type: ${type}`);
    }

    return await this.create({
      user_id: userId,
      type: `vendor_${type}`,
      title: messageInfo.title,
      message: messageInfo.message,
      data
    });
  }

  static async createAdminNotification(adminUserId, type, data = {}) {
    const adminMessages = {
      new_order: {
        title: 'New Order Received',
        message: `New order #${data.order_id} has been placed by ${data.customer_name}.`
      },
      vendor_application: {
        title: 'New Vendor Application',
        message: `${data.business_name} has submitted a vendor application for review.`
      },
      product_review: {
        title: 'Product Needs Review',
        message: `New product "${data.product_name}" by ${data.vendor_name} is pending approval.`
      },
      low_stock: {
        title: 'Low Stock Alert',
        message: `Product "${data.product_name}" is running low on stock (${data.stock_quantity} remaining).`
      }
    };

    const messageInfo = adminMessages[type];
    if (!messageInfo) {
      throw new Error(`Invalid admin notification type: ${type}`);
    }

    return await this.create({
      user_id: adminUserId,
      type: `admin_${type}`,
      title: messageInfo.title,
      message: messageInfo.message,
      data
    });
  }

  static async cleanup(daysOld = 30) {
    const query = `
      DELETE FROM notifications
      WHERE created_at < NOW() - INTERVAL '${daysOld} days'
    `;

    const result = await db.query(query);
    return { deleted_count: result.rowCount || 0 };
  }
}

module.exports = Notification;