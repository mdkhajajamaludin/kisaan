const express = require('express');
const router = express.Router();
const ProductSubmission = require('../models/ProductSubmission');
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');
const Joi = require('joi');

// Validation schema for product submission
const submissionSchema = Joi.object({
  business_name: Joi.string().min(2).max(255).required(),
  business_description: Joi.string().max(2000).optional().allow(''),
  business_type: Joi.string().max(100).optional().allow(''),
  business_address: Joi.string().max(500).optional().allow(''),
  business_phone: Joi.string().max(20).optional().allow(''),
  business_email: Joi.string().email().optional().allow(''),
  tax_id: Joi.string().max(100).optional().allow(''),
  bank_account_info: Joi.string().max(500).optional().allow(''),
  product_categories: Joi.array().items(Joi.string()).optional(),
  estimated_products_count: Joi.number().integer().min(1).optional(),
  sample_product_description: Joi.string().max(1000).optional().allow(''),
  reason_for_selling: Joi.string().max(1000).optional().allow('')
});

// ============================================
// USER ROUTES
// ============================================

// Submit product access request
router.post('/submit', verifyToken, async (req, res) => {
  try {
    // Validate input
    const { error, value } = submissionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if user already has access
    const existingAccess = await ProductSubmission.hasProductAccess(req.user.id);
    if (existingAccess) {
      return res.status(400).json({ 
        error: 'You already have product creation access',
        access: existingAccess
      });
    }

    // Check if user has pending submission
    const hasPending = await ProductSubmission.hasPendingSubmission(req.user.id);
    if (hasPending) {
      return res.status(400).json({ 
        error: 'You already have a pending submission. Please wait for admin review.'
      });
    }

    // Create submission
    const submission = await ProductSubmission.create({
      ...value,
      user_id: req.user.id
    });

    // Notify admin (dev.unity.cc@gmail.com)
    try {
      const db = require('../config/database');
      const adminResult = await db.query(
        'SELECT id FROM users WHERE email = $1',
        ['dev.unity.cc@gmail.com']
      );

      if (adminResult.rows.length > 0) {
        await Notification.create({
          user_id: adminResult.rows[0].id,
          type: 'product_submission_received',
          title: 'New Product Access Request',
          message: `${req.user.name || req.user.email} has requested product creation access for "${value.business_name}"`,
          data: {
            submission_id: submission.id,
            user_id: req.user.id,
            business_name: value.business_name
          }
        });
      }
    } catch (notifError) {
      console.error('Failed to create admin notification:', notifError);
    }

    res.status(201).json({
      success: true,
      message: 'Product access request submitted successfully. You will be notified once reviewed.',
      submission
    });
  } catch (error) {
    console.error('Submit product access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's submissions
router.get('/my-submissions', verifyToken, async (req, res) => {
  try {
    const submissions = await ProductSubmission.findByUserId(req.user.id);
    res.json({ success: true, submissions });
  } catch (error) {
    console.error('Get user submissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's product access status
router.get('/my-access', verifyToken, async (req, res) => {
  try {
    const access = await ProductSubmission.getUserAccess(req.user.id);
    const latestSubmission = await ProductSubmission.findLatestByUserId(req.user.id);

    res.json({
      success: true,
      has_access: access?.is_approved || false,
      access: access || null,
      latest_submission: latestSubmission || null
    });
  } catch (error) {
    console.error('Get user access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all submissions (admin only)
router.get('/admin/all', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    const filters = {
      status,
      search,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const submissions = await ProductSubmission.getAll(filters);
    const pendingCount = await ProductSubmission.getPendingCount();

    res.json({
      success: true,
      submissions,
      pending_count: pendingCount,
      filters
    });
  } catch (error) {
    console.error('Get all submissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get submission details (admin only)
router.get('/admin/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const submission = await ProductSubmission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({ success: true, submission });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve submission (admin only)
router.post('/admin/:id/approve', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { notes = '', max_products = 100 } = req.body;
    const submissionId = parseInt(req.params.id);

    // Get submission details first
    const submissionBefore = await ProductSubmission.findById(submissionId);
    if (!submissionBefore) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submissionBefore.status !== 'pending') {
      return res.status(400).json({ 
        error: `Submission already ${submissionBefore.status}` 
      });
    }

    // Approve submission
    const submission = await ProductSubmission.approve(
      submissionId,
      req.user.id,
      notes,
      max_products
    );

    // Notify user of approval
    try {
      await Notification.create({
        user_id: submission.user_id,
        type: 'product_submission_approved',
        title: '🎉 Product Access Approved!',
        message: `Congratulations! Your request to add products for "${submission.business_name}" has been approved. You can now start adding products.`,
        data: {
          submission_id: submission.id,
          max_products,
          admin_notes: notes
        }
      });
    } catch (notifError) {
      console.error('Failed to create user notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Product access approved successfully',
      submission
    });
  } catch (error) {
    console.error('Approve submission error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      submissionId: req.params.id,
      adminId: req.user?.id
    });
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Reject submission (admin only)
router.post('/admin/:id/reject', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { notes = '' } = req.body;
    const submissionId = parseInt(req.params.id);

    // Get submission details first
    const submissionBefore = await ProductSubmission.findById(submissionId);
    if (!submissionBefore) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submissionBefore.status !== 'pending') {
      return res.status(400).json({ 
        error: `Submission already ${submissionBefore.status}` 
      });
    }

    // Reject submission
    const submission = await ProductSubmission.reject(
      submissionId,
      req.user.id,
      notes
    );

    // Notify user of rejection
    try {
      await Notification.create({
        user_id: submission.user_id,
        type: 'product_submission_rejected',
        title: 'Product Access Request Update',
        message: `Your request to add products for "${submission.business_name}" has been reviewed. ${notes || 'Please contact support for more information.'}`,
        data: {
          submission_id: submission.id,
          admin_notes: notes
        }
      });
    } catch (notifError) {
      console.error('Failed to create user notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Product access request rejected',
      submission
    });
  } catch (error) {
    console.error('Reject submission error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      submissionId: req.params.id,
      adminId: req.user?.id
    });
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

