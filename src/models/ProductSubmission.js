const db = require('../config/database');

class ProductSubmission {
  // Create a new product submission request
  static async create(submissionData) {
    const {
      user_id,
      business_name,
      business_description,
      business_type,
      business_address,
      business_phone,
      business_email,
      tax_id,
      bank_account_info,
      product_categories = [],
      estimated_products_count,
      sample_product_description,
      reason_for_selling
    } = submissionData;

    const query = `
      INSERT INTO product_submission_requests (
        user_id, business_name, business_description, business_type,
        business_address, business_phone, business_email, tax_id,
        bank_account_info, product_categories, estimated_products_count,
        sample_product_description, reason_for_selling, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
      RETURNING *
    `;

    const result = await db.query(query, [
      user_id, business_name, business_description, business_type,
      business_address, business_phone, business_email, tax_id,
      bank_account_info, product_categories, estimated_products_count,
      sample_product_description, reason_for_selling
    ]);

    return result.rows[0];
  }

  // Get submission by ID
  static async findById(id) {
    const query = `
      SELECT 
        psr.*,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        reviewer.name as reviewer_name
      FROM product_submission_requests psr
      LEFT JOIN users u ON psr.user_id = u.id
      LEFT JOIN users reviewer ON psr.reviewed_by = reviewer.id
      WHERE psr.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  // Get all submissions by user
  static async findByUserId(userId) {
    const query = `
      SELECT 
        psr.*,
        reviewer.name as reviewer_name
      FROM product_submission_requests psr
      LEFT JOIN users reviewer ON psr.reviewed_by = reviewer.id
      WHERE psr.user_id = $1
      ORDER BY psr.created_at DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Get latest submission by user
  static async findLatestByUserId(userId) {
    const query = `
      SELECT 
        psr.*,
        reviewer.name as reviewer_name
      FROM product_submission_requests psr
      LEFT JOIN users reviewer ON psr.reviewed_by = reviewer.id
      WHERE psr.user_id = $1
      ORDER BY psr.created_at DESC
      LIMIT 1
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Get all submissions (admin)
  static async getAll(filters = {}) {
    let query = `
      SELECT 
        psr.*,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        u.is_active,
        reviewer.name as reviewer_name,
        upa.is_approved as has_access
      FROM product_submission_requests psr
      LEFT JOIN users u ON psr.user_id = u.id
      LEFT JOIN users reviewer ON psr.reviewed_by = reviewer.id
      LEFT JOIN user_product_access upa ON psr.user_id = upa.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND psr.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.search) {
      paramCount++;
      query += ` AND (psr.business_name ILIKE $${paramCount} OR u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
    }

    query += ` ORDER BY psr.created_at DESC`;

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

  // Get pending submissions count
  static async getPendingCount() {
    const query = `
      SELECT COUNT(*) as count
      FROM product_submission_requests
      WHERE status = 'pending'
    `;

    const result = await db.query(query);
    return parseInt(result.rows[0].count);
  }

  // Approve submission
  static async approve(id, adminId, notes = '', maxProducts = 100) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Update submission status
      const updateQuery = `
        UPDATE product_submission_requests
        SET status = 'approved',
            admin_notes = $2,
            reviewed_by = $3,
            reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [id, notes, adminId]);
      const submission = updateResult.rows[0];

      if (!submission) {
        throw new Error('Submission not found');
      }

      // Create or update user product access
      const accessQuery = `
        INSERT INTO user_product_access (
          user_id, submission_request_id, is_approved, 
          approved_by, approved_at, max_products, notes
        )
        VALUES ($1, $2, true, $3, CURRENT_TIMESTAMP, $4, $5)
        ON CONFLICT (user_id) 
        DO UPDATE SET
          is_approved = true,
          approved_by = $3,
          approved_at = CURRENT_TIMESTAMP,
          max_products = $4,
          notes = $5,
          revoked_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      await client.query(accessQuery, [
        submission.user_id,
        id,
        adminId,
        maxProducts,
        notes
      ]);

      await client.query('COMMIT');
      return submission;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Reject submission
  static async reject(id, adminId, notes = '') {
    const query = `
      UPDATE product_submission_requests
      SET status = 'rejected',
          admin_notes = $2,
          reviewed_by = $3,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [id, notes, adminId]);
    return result.rows[0];
  }

  // Check if user has pending submission
  static async hasPendingSubmission(userId) {
    const query = `
      SELECT COUNT(*) as count
      FROM product_submission_requests
      WHERE user_id = $1 AND status = 'pending'
    `;

    const result = await db.query(query, [userId]);
    return parseInt(result.rows[0].count) > 0;
  }

  // Check if user has product access
  static async hasProductAccess(userId) {
    const query = `
      SELECT *
      FROM user_product_access
      WHERE user_id = $1 AND is_approved = true AND revoked_at IS NULL
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Get user's product access details
  static async getUserAccess(userId) {
    const query = `
      SELECT 
        upa.*,
        approver.name as approver_name,
        (SELECT COUNT(*) FROM products WHERE vendor_id = $1 AND is_active = true) as current_products_count
      FROM user_product_access upa
      LEFT JOIN users approver ON upa.approved_by = approver.id
      WHERE upa.user_id = $1
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Revoke user's product access
  static async revokeAccess(userId, adminId, reason = '') {
    const query = `
      UPDATE user_product_access
      SET is_approved = false,
          revoked_at = CURRENT_TIMESTAMP,
          notes = CONCAT(COALESCE(notes, ''), '\nRevoked: ', $3),
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await db.query(query, [userId, adminId, reason]);
    return result.rows[0];
  }
}

module.exports = ProductSubmission;

