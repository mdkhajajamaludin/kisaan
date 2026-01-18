const db = require('../config/database');

class Order {
  static async create(orderData) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const { user_id, items, total_amount, shipping_address, payment_method, notes } = orderData;

      // Create order
      const orderQuery = `
        INSERT INTO orders (user_id, total_amount, shipping_address, payment_method, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const orderResult = await client.query(orderQuery, [
        user_id, total_amount, JSON.stringify(shipping_address), payment_method, notes
      ]);

      const order = orderResult.rows[0];

      // Create order items and update product stock
      for (const item of items) {
        // Add order item
        const itemQuery = `
          INSERT INTO order_items (order_id, product_id, quantity, price)
          VALUES ($1, $2, $3, $4)
        `;

        await client.query(itemQuery, [order.id, item.product_id, item.quantity, item.price]);

        // Update product stock
        const stockQuery = `
          UPDATE products 
          SET stock_quantity = stock_quantity - $2
          WHERE id = $1 AND stock_quantity >= $2
        `;

        const stockResult = await client.query(stockQuery, [item.product_id, item.quantity]);

        if (stockResult.rowCount === 0) {
          throw new Error(`Insufficient stock for product ${item.product_id}`);
        }
      }

      await client.query('COMMIT');
      return order;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findById(id) {
    const query = `
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async getOrderItems(orderId) {
    const query = `
      SELECT oi.*, p.name as product_name, p.images
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `;

    const result = await db.query(query, [orderId]);
    return result.rows;
  }

  static async getByUser(userId, limit = 20, offset = 0) {
    const query = `
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  static async getAll(filters = {}, paginationOptions = {}) {
    const { limit = 50, offset = 0 } = paginationOptions;
    let query = `
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND o.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.user_id) {
      paramCount++;
      query += ` AND o.user_id = $${paramCount}`;
      params.push(filters.user_id);
    }

    if (filters.search) {
      paramCount++;
      query += ` AND (u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount} OR CAST(o.id AS TEXT) ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
    }

    if (filters.start_date) {
      paramCount++;
      query += ` AND o.created_at >= $${paramCount}`;
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      paramCount++;
      query += ` AND o.created_at <= $${paramCount}`;
      params.push(filters.end_date);
    }

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered_orders`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    query += ` ORDER BY o.created_at DESC`;

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await db.query(query, params);

    return {
      orders: result.rows,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async updateStatus(id, status, adminNotes = null) {
    let query, params;

    if (adminNotes) {
      query = `
        UPDATE orders 
        SET status = $2, 
            admin_notes = COALESCE(admin_notes, '') || CASE WHEN admin_notes IS NULL OR admin_notes = '' THEN $3 ELSE '\n' || $3 END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      params = [id, status, adminNotes];
    } else {
      query = `
        UPDATE orders 
        SET status = $2, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      params = [id, status];
    }

    const result = await db.query(query, params);
    return result.rows[0];
  }

  static async getOrderWithItems(id) {
    const order = await this.findById(id);
    if (!order) return null;

    const items = await this.getOrderItems(id);
    return { ...order, items };
  }

  static async getVendorOrders(vendorId, limit = 20, offset = 0) {
    const query = `
      SELECT DISTINCT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE p.vendor_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [vendorId, limit, offset]);
    return result.rows;
  }

  static async getAnalytics(startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as average_order_value,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
    `;

    const result = await db.query(query, [startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = Order;