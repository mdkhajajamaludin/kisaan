const db = require('../config/database');

class VendorRequest {
  static async create(requestData) {
    const { user_id, business_name, business_type, description, contact_info, documents = [] } = requestData;
    
    const query = `
      INSERT INTO vendor_requests (user_id, business_name, business_type, description, contact_info, documents)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await db.query(query, [
      user_id, business_name, business_type, description,
      JSON.stringify(contact_info), JSON.stringify(documents)
    ]);
    
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT vr.*, u.name as user_name, u.email as user_email
      FROM vendor_requests vr
      LEFT JOIN users u ON vr.user_id = u.id
      WHERE vr.id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const query = `
      SELECT vr.*
      FROM vendor_requests vr
      WHERE vr.user_id = $1
      ORDER BY vr.created_at DESC
      LIMIT 1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT vr.*, u.name as user_name, u.email as user_email
      FROM vendor_requests vr
      LEFT JOIN users u ON vr.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND vr.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.business_type) {
      paramCount++;
      query += ` AND vr.business_type = $${paramCount}`;
      params.push(filters.business_type);
    }

    query += ` ORDER BY vr.created_at DESC`;

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  static async updateStatus(id, status, adminNotes = null) {
    const query = `
      UPDATE vendor_requests 
      SET status = $2, 
          admin_notes = COALESCE($3, admin_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id, status, adminNotes]);
    return result.rows[0];
  }

  static async approve(id, adminNotes = null) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Update request status
      const requestQuery = `
        UPDATE vendor_requests
        SET status = 'approved',
            admin_notes = COALESCE($2, admin_notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const requestResult = await client.query(requestQuery, [id, adminNotes]);
      const request = requestResult.rows[0];

      if (!request) {
        await client.query('ROLLBACK');
        throw new Error('Vendor request not found');
      }

      // Update user role to vendor and set as active
      const userQuery = `
        UPDATE users
        SET role = 'vendor', is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const userResult = await client.query(userQuery, [request.user_id]);
      const updatedUser = userResult.rows[0];

      if (!updatedUser) {
        await client.query('ROLLBACK');
        throw new Error('Failed to update user to vendor role');
      }

      console.log('User successfully updated to vendor:', {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        is_active: updatedUser.is_active
      });

      // Verify the user was properly updated
      const verifyQuery = `
        SELECT id, email, role, is_active
        FROM users
        WHERE id = $1 AND role = 'vendor' AND is_active = true
      `;

      const verifyResult = await client.query(verifyQuery, [request.user_id]);

      if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Vendor approval verification failed - user not properly activated');
      }

      await client.query('COMMIT');
      console.log('Vendor approval transaction committed successfully');

      return request;

    } catch (error) {
      console.error('Vendor approval error:', error);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  static async reject(id, adminNotes) {
    const query = `
      UPDATE vendor_requests 
      SET status = 'rejected', 
          admin_notes = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id, adminNotes]);
    return result.rows[0];
  }

  static async getPendingCount() {
    const query = `
      SELECT COUNT(*) as count
      FROM vendor_requests
      WHERE status = 'pending'
    `;
    
    const result = await db.query(query);
    return parseInt(result.rows[0].count);
  }

  static async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_requests,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_requests
      FROM vendor_requests
    `;
    
    const result = await db.query(query);
    return result.rows[0];
  }
}

module.exports = VendorRequest;