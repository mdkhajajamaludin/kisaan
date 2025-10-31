const db = require('../config/database');

class Vendor {
  static async getAll(limit = 50, offset = 0) {
    const query = `
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
             vr.business_name, vr.business_type, vr.description
      FROM users u
      LEFT JOIN vendor_requests vr ON u.id = vr.user_id AND vr.status = 'approved'
      WHERE u.role = 'vendor'
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }

  static async findById(id) {
    const query = `
      SELECT u.*, vr.business_name, vr.business_type, vr.description, vr.contact_info
      FROM users u
      LEFT JOIN vendor_requests vr ON u.id = vr.user_id AND vr.status = 'approved'
      WHERE u.id = $1 AND u.role = 'vendor'
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async checkVendorAccess(vendorId) {
    // Handle both string and number vendor IDs
    let id;
    if (typeof vendorId === 'string') {
      id = parseInt(vendorId);
    } else {
      id = vendorId;
    }
    
    if (isNaN(id) || id <= 0) {
      throw new Error('Invalid vendor ID');
    }
    
    const query = `
      SELECT id, is_active, role
      FROM users
      WHERE id = $1 AND role = 'vendor'
    `;
    
    const result = await db.query(query, [id]);
    const vendor = result.rows[0];
    
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    
    if (!vendor.is_active) {
      throw new Error('Vendor account is disabled. Please contact support.');
    }
    
    return vendor;
  }

  static async getVendorProducts(vendorId, limit = 20, offset = 0) {
    const query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.vendor_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [vendorId, limit, offset]);
    return result.rows;
  }

  static async getVendorStats(vendorId) {
    const query = `
      SELECT 
        COUNT(p.id) as total_products,
        COUNT(CASE WHEN p.stock_quantity > 0 THEN 1 END) as in_stock_products,
        COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END) as out_of_stock_products,
        COALESCE(SUM(oi.quantity * oi.price), 0) as total_sales,
        COUNT(DISTINCT o.id) as total_orders
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed'
      WHERE p.vendor_id = $1 AND p.is_active = true
    `;
    
    const result = await db.query(query, [vendorId]);
    return result.rows[0];
  }

  static async getVendorOrders(vendorId, limit = 20, offset = 0) {
    const query = `
      SELECT DISTINCT o.*, u.name as customer_name, u.email as customer_email
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE p.vendor_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [vendorId, limit, offset]);
    return result.rows;
  }

  static async getVendorOrderItems(vendorId, orderId) {
    const query = `
      SELECT oi.*, p.name as product_name, p.images
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE p.vendor_id = $1 AND oi.order_id = $2
    `;
    
    const result = await db.query(query, [vendorId, orderId]);
    return result.rows;
  }

  static async getDashboardData(vendorId) {
    const stats = await this.getVendorStats(vendorId);
    
    // Get recent orders
    const recentOrdersQuery = `
      SELECT DISTINCT o.id, o.total_amount, o.status, o.created_at, u.name as customer_name
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE p.vendor_id = $1
      ORDER BY o.created_at DESC
      LIMIT 5
    `;
    
    const recentOrders = await db.query(recentOrdersQuery, [vendorId]);
    
    // Get low stock products
    const lowStockQuery = `
      SELECT id, name, stock_quantity, price
      FROM products
      WHERE vendor_id = $1 AND stock_quantity <= 5 AND is_active = true
      ORDER BY stock_quantity ASC
      LIMIT 5
    `;
    
    const lowStockProducts = await db.query(lowStockQuery, [vendorId]);
    
    // Get monthly sales data
    const monthlySalesQuery = `
      SELECT 
        DATE_TRUNC('month', o.created_at) as month,
        COUNT(DISTINCT o.id) as orders_count,
        SUM(oi.quantity * oi.price) as revenue
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.vendor_id = $1 AND o.status = 'completed'
        AND o.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY month DESC
    `;
    
    const monthlySales = await db.query(monthlySalesQuery, [vendorId]);
    
    return {
      stats,
      recentOrders: recentOrders.rows,
      lowStockProducts: lowStockProducts.rows,
      monthlySales: monthlySales.rows
    };
  }

  static async searchVendors(searchTerm, limit = 20, offset = 0) {
    const query = `
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
             vr.business_name, vr.business_type, vr.description
      FROM users u
      LEFT JOIN vendor_requests vr ON u.id = vr.user_id AND vr.status = 'approved'
      WHERE u.role = 'vendor' 
      AND (u.name ILIKE $1 OR vr.business_name ILIKE $1 OR vr.business_type ILIKE $1)
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [`%${searchTerm}%`, limit, offset]);
    return result.rows;
  }
}

module.exports = Vendor;