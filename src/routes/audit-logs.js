const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

// Create admin_actions table if it doesn't exist
const createAuditTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        action_type VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id INTEGER,
        target_name VARCHAR(255),
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
      CREATE INDEX IF NOT EXISTS idx_admin_actions_action_type ON admin_actions(action_type);
      CREATE INDEX IF NOT EXISTS idx_admin_actions_target_type ON admin_actions(target_type);
      CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at);
    `);
  } catch (error) {
    console.error('Error creating audit table:', error);
  }
};

// Initialize table
createAuditTable();

// Log admin action helper function
const logAdminAction = async (adminId, actionType, targetType, targetId, targetName, details, req) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    await db.query(`
      INSERT INTO admin_actions (
        admin_id, action_type, target_type, target_id, target_name, 
        details, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    `, [
      adminId,
      actionType,
      targetType,
      targetId,
      targetName,
      JSON.stringify(details),
      ipAddress,
      userAgent
    ]);
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
};

// Get audit logs with filtering
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      search,
      action_type,
      target_type,
      date_filter,
      admin_id
    } = req.query;

    let query = `
      SELECT 
        aa.*,
        u.name as admin_name,
        u.email as admin_email
      FROM admin_actions aa
      LEFT JOIN users u ON aa.admin_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (
        u.name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR 
        aa.target_name ILIKE $${paramCount} OR
        aa.action_type ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    if (action_type) {
      paramCount++;
      query += ` AND aa.action_type = $${paramCount}`;
      params.push(action_type);
    }

    if (target_type) {
      paramCount++;
      query += ` AND aa.target_type = $${paramCount}`;
      params.push(target_type);
    }

    if (admin_id) {
      paramCount++;
      query += ` AND aa.admin_id = $${paramCount}`;
      params.push(parseInt(admin_id));
    }

    if (date_filter && date_filter !== 'all') {
      let dateCondition = '';
      switch (date_filter) {
        case '1d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '1 day'";
          break;
        case '7d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '30 days'";
          break;
        case '90d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '90 days'";
          break;
      }
      if (dateCondition) {
        query += ` AND ${dateCondition}`;
      }
    }

    query += ` ORDER BY aa.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM admin_actions aa
      LEFT JOIN users u ON aa.admin_id = u.id
      WHERE 1=1
    `;

    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND (
        u.name ILIKE $${countParamCount} OR 
        u.email ILIKE $${countParamCount} OR 
        aa.target_name ILIKE $${countParamCount} OR
        aa.action_type ILIKE $${countParamCount}
      )`;
      countParams.push(`%${search}%`);
    }

    if (action_type) {
      countParamCount++;
      countQuery += ` AND aa.action_type = $${countParamCount}`;
      countParams.push(action_type);
    }

    if (target_type) {
      countParamCount++;
      countQuery += ` AND aa.target_type = $${countParamCount}`;
      countParams.push(target_type);
    }

    if (admin_id) {
      countParamCount++;
      countQuery += ` AND aa.admin_id = $${countParamCount}`;
      countParams.push(parseInt(admin_id));
    }

    if (date_filter && date_filter !== 'all') {
      let dateCondition = '';
      switch (date_filter) {
        case '1d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '1 day'";
          break;
        case '7d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '30 days'";
          break;
        case '90d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '90 days'";
          break;
      }
      if (dateCondition) {
        countQuery += ` AND ${dateCondition}`;
      }
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      success: true,
      logs: result.rows,
      total: parseInt(countResult.rows[0].total),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export audit logs
router.get('/export', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      search,
      action_type,
      target_type,
      date_filter,
      admin_id,
      format = 'csv'
    } = req.query;

    let query = `
      SELECT 
        aa.id,
        u.name as admin_name,
        u.email as admin_email,
        aa.action_type,
        aa.target_type,
        aa.target_id,
        aa.target_name,
        aa.details,
        aa.ip_address,
        aa.user_agent,
        aa.created_at
      FROM admin_actions aa
      LEFT JOIN users u ON aa.admin_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    // Apply same filters as the main endpoint
    if (search) {
      paramCount++;
      query += ` AND (
        u.name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR 
        aa.target_name ILIKE $${paramCount} OR
        aa.action_type ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    if (action_type) {
      paramCount++;
      query += ` AND aa.action_type = $${paramCount}`;
      params.push(action_type);
    }

    if (target_type) {
      paramCount++;
      query += ` AND aa.target_type = $${paramCount}`;
      params.push(target_type);
    }

    if (admin_id) {
      paramCount++;
      query += ` AND aa.admin_id = $${paramCount}`;
      params.push(parseInt(admin_id));
    }

    if (date_filter && date_filter !== 'all') {
      let dateCondition = '';
      switch (date_filter) {
        case '1d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '1 day'";
          break;
        case '7d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '30 days'";
          break;
        case '90d':
          dateCondition = "aa.created_at >= NOW() - INTERVAL '90 days'";
          break;
      }
      if (dateCondition) {
        query += ` AND ${dateCondition}`;
      }
    }

    query += ` ORDER BY aa.created_at DESC LIMIT 10000`; // Limit exports to 10k records

    const result = await db.query(query, params);

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'ID', 'Admin Name', 'Admin Email', 'Action Type', 'Target Type', 
        'Target ID', 'Target Name', 'IP Address', 'Timestamp'
      ];

      const csvRows = result.rows.map(row => [
        row.id,
        row.admin_name || '',
        row.admin_email || '',
        row.action_type,
        row.target_type,
        row.target_id || '',
        row.target_name || '',
        row.ip_address || '',
        new Date(row.created_at).toISOString()
      ]);

      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => 
          row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length,
        exportedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get audit log statistics
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    let dateCondition = '';
    switch (period) {
      case '7d':
        dateCondition = "WHERE created_at >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        dateCondition = "WHERE created_at >= NOW() - INTERVAL '30 days'";
        break;
      case '90d':
        dateCondition = "WHERE created_at >= NOW() - INTERVAL '90 days'";
        break;
      case '1y':
        dateCondition = "WHERE created_at >= NOW() - INTERVAL '1 year'";
        break;
    }

    // Get action type distribution
    const actionStatsQuery = `
      SELECT action_type, COUNT(*) as count
      FROM admin_actions
      ${dateCondition}
      GROUP BY action_type
      ORDER BY count DESC
    `;

    const actionStats = await db.query(actionStatsQuery);

    // Get admin activity
    const adminStatsQuery = `
      SELECT 
        u.name as admin_name,
        u.email as admin_email,
        COUNT(aa.id) as action_count
      FROM admin_actions aa
      LEFT JOIN users u ON aa.admin_id = u.id
      ${dateCondition}
      GROUP BY u.id, u.name, u.email
      ORDER BY action_count DESC
      LIMIT 10
    `;

    const adminStats = await db.query(adminStatsQuery);

    // Get daily activity
    const dailyStatsQuery = `
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as action_count
      FROM admin_actions
      ${dateCondition}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    const dailyStats = await db.query(dailyStatsQuery);

    res.json({
      success: true,
      stats: {
        actionDistribution: actionStats.rows,
        adminActivity: adminStats.rows,
        dailyActivity: dailyStats.rows,
        period
      }
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, logAdminAction };