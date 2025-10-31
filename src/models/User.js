const db = require('../config/database');

class User {
  static async create(userData) {
    const { firebase_uid, email, name, role = 'customer', phone, addresses = [], preferences = {} } = userData;
    
    const query = `
      INSERT INTO users (firebase_uid, email, name, role, phone, addresses, preferences)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await db.query(query, [
      firebase_uid, email, name, role, phone, 
      JSON.stringify(addresses), JSON.stringify(preferences)
    ]);
    
    return result.rows[0];
  }

  static async findByFirebaseUid(firebase_uid) {
    const query = 'SELECT * FROM users WHERE firebase_uid = $1';
    const result = await db.query(query, [firebase_uid]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await db.query(query, [email]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, userData) {
    const { name, phone, addresses, preferences } = userData;
    
    const query = `
      UPDATE users 
      SET name = COALESCE($2, name),
          phone = COALESCE($3, phone),
          addresses = COALESCE($4, addresses),
          preferences = COALESCE($5, preferences),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [
      id, name, phone,
      addresses ? JSON.stringify(addresses) : null,
      preferences ? JSON.stringify(preferences) : null
    ]);
    
    return result.rows[0];
  }

  static async updateRole(id, role) {
    const query = `
      UPDATE users 
      SET role = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id, role]);
    return result.rows[0];
  }

  static async updateVendorStatus(id, isActive) {
    const query = `
      UPDATE users 
      SET is_active = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND role = 'vendor'
      RETURNING *
    `;
    
    const result = await db.query(query, [id, isActive]);
    return result.rows[0];
  }

  static async getAll(limit = 50, offset = 0) {
    const query = `
      SELECT id, email, name, role, phone, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }

  static async getVendors() {
    const query = `
      SELECT u.id, u.email, u.name, u.phone, u.created_at, u.is_active,
             vr.business_name, vr.business_type, vr.description, vr.contact_info,
             COUNT(p.id) as product_count,
             COUNT(CASE WHEN p.is_active = true THEN 1 END) as active_products
      FROM users u
      LEFT JOIN vendor_requests vr ON u.id = vr.user_id AND vr.status = 'approved'
      LEFT JOIN products p ON u.id = p.vendor_id
      WHERE u.role = 'vendor'
      GROUP BY u.id, vr.business_name, vr.business_type, vr.description, vr.contact_info
      ORDER BY u.created_at DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = User;