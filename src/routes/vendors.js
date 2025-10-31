const express = require('express');
const router = express.Router();
const VendorRequest = require('../models/VendorRequest');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Notification = require('../models/Notification');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin, requireVendor } = require('../middleware/roles');
const { uploadMultiple, handleUploadError } = require('../middleware/upload');
const emailService = require('../services/emailService');
const Joi = require('joi');

// Validation schemas
const vendorRequestSchema = Joi.object({
  business_name: Joi.string().min(2).max(255).required(),
  business_type: Joi.string().max(100).required(),
  description: Joi.string().max(2000).required(),
  contact_info: Joi.object({
    phone: Joi.string().required(),
    address: Joi.string().required(),
    email: Joi.string().email().optional(),
    owner_name: Joi.string().optional(),
    website: Joi.string().uri().optional(),
    experience: Joi.string().optional(),
    social_media: Joi.object().optional()
  }).unknown(true).required()
}).unknown(true);

const approveRejectSchema = Joi.object({
  admin_notes: Joi.string().max(1000).optional()
});

// Submit vendor application
router.post('/request', verifyToken, uploadMultiple, handleUploadError, async (req, res) => {
  try {
    console.log('Vendor request body:', req.body);
    
    // Parse contact_info if it's a string
    let requestData = { ...req.body };
    if (typeof requestData.contact_info === 'string') {
      try {
        requestData.contact_info = JSON.parse(requestData.contact_info);
      } catch (parseError) {
        return res.status(400).json({ error: 'Invalid contact_info format' });
      }
    }
    
    const { error, value } = vendorRequestSchema.validate(requestData);
    if (error) {
      console.log('Validation error:', error.details[0].message);
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if user already has a pending or approved request
    const existingRequest = await VendorRequest.findByUserId(req.user.id);
    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ error: 'You already have a pending vendor application' });
      }
      if (existingRequest.status === 'approved') {
        return res.status(400).json({ error: 'You are already a vendor' });
      }
    }

    // Process uploaded documents
    let documentUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        const ImageService = require('../services/imageService');
        const uploadResults = await ImageService.uploadMultipleImages(req.files, 'vendor-documents');
        documentUrls = uploadResults.map(result => ({
          url: result.url,
          filename: result.publicId,
          uploadedAt: new Date()
        }));
      } catch (uploadError) {
        console.error('Document upload error:', uploadError);
        return res.status(400).json({ error: 'Failed to upload documents' });
      }
    }

    const vendorData = {
      user_id: req.user.id,
      ...value,
      documents: documentUrls
    };

    const vendorRequest = await VendorRequest.create(vendorData);

    // Create notification for user
    try {
      await Notification.createVendorNotification(
        req.user.id,
        'application_submitted',
        { business_name: value.business_name }
      );
    } catch (notificationError) {
      console.error('Vendor application notification error:', notificationError);
    }

    // Create notification for admin
    try {
      // Find admin users to notify
      const adminQuery = 'SELECT id FROM users WHERE role = \'admin\'';
      const adminResult = await db.query(adminQuery);
      
      for (const admin of adminResult.rows) {
        await Notification.createAdminNotification(
          admin.id,
          'vendor_application',
          { 
            business_name: value.business_name,
            applicant_name: req.user.name,
            request_id: vendorRequest.id
          }
        );
      }
    } catch (notificationError) {
      console.error('Admin vendor notification error:', notificationError);
    }

    // Send notification email to admin
    try {
      // Find admin users to notify
      const adminQuery = 'SELECT email FROM users WHERE role = \'admin\' LIMIT 1';
      const adminResult = await db.query(adminQuery);
      
      if (adminResult.rows.length > 0) {
        await emailService.sendVendorApplicationNotification(
          adminResult.rows[0].email,
          req.user.name,
          value.business_name
        );
      }
    } catch (emailError) {
      console.error('Vendor application notification email error:', emailError);
      // Don't fail request submission if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Vendor application submitted successfully',
      request: vendorRequest
    });
  } catch (error) {
    console.error('Vendor request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all vendor requests (admin only)
router.get('/requests', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const requests = await VendorRequest.getAll(filters);

    res.json({
      success: true,
      requests,
      count: requests.length
    });
  } catch (error) {
    console.error('Get vendor requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single vendor request (admin only)
router.get('/requests/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const request = await VendorRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }

    res.json({
      success: true,
      request
    });
  } catch (error) {
    console.error('Get vendor request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve vendor request (admin only)
router.put('/requests/:id/approve', verifyToken, requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const { error, value } = approveRejectSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const request = await VendorRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    const approvedRequest = await VendorRequest.approve(requestId, value.admin_notes);

    // Create notification for vendor
    try {
      await Notification.createVendorNotification(
        request.user_id,
        'application_approved',
        { 
          business_name: request.business_name,
          admin_notes: value.admin_notes
        }
      );
    } catch (notificationError) {
      console.error('Vendor approval notification error:', notificationError);
    }

    // Send approval email to vendor
    try {
      const user = await User.findById(request.user_id);
      if (user) {
        await emailService.sendVendorApprovalEmail(
          user.email,
          user.name,
          request.business_name
        );
      }
    } catch (emailError) {
      console.error('Vendor approval email error:', emailError);
      // Don't fail approval if email fails
    }

    res.json({
      success: true,
      message: 'Vendor request approved successfully',
      request: approvedRequest
    });
  } catch (error) {
    console.error('Approve vendor request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject vendor request (admin only)
router.put('/requests/:id/reject', verifyToken, requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const { error, value } = approveRejectSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const request = await VendorRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    const rejectedRequest = await VendorRequest.reject(requestId, value.admin_notes);

    // Create notification for vendor
    try {
      await Notification.createVendorNotification(
        request.user_id,
        'application_rejected',
        { 
          business_name: request.business_name,
          admin_notes: value.admin_notes
        }
      );
    } catch (notificationError) {
      console.error('Vendor rejection notification error:', notificationError);
    }

    // Send rejection email to vendor
    try {
      const user = await User.findById(request.user_id);
      if (user) {
        await emailService.sendVendorRejectionEmail(
          user.email,
          user.name,
          value.admin_notes
        );
      }
    } catch (emailError) {
      console.error('Vendor rejection email error:', emailError);
      // Don't fail rejection if email fails
    }

    res.json({
      success: true,
      message: 'Vendor request rejected',
      request: rejectedRequest
    });
  } catch (error) {
    console.error('Reject vendor request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all approved vendors
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;

    let vendors;
    if (search) {
      vendors = await Vendor.searchVendors(search, parseInt(limit), parseInt(offset));
    } else {
      vendors = await Vendor.getAll(parseInt(limit), parseInt(offset));
    }

    res.json({
      success: true,
      vendors,
      count: vendors.length
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single vendor details
router.get('/:id', async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({
      success: true,
      vendor
    });
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor dashboard data (vendor only)
router.get('/dashboard/data', verifyToken, requireVendor, async (req, res) => {
  try {
    const vendorId = req.user.role === 'admin' ? req.query.vendor_id : req.user.id;
    
    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID required' });
    }

    const dashboardData = await Vendor.getDashboardData(parseInt(vendorId));

    res.json({
      success: true,
      dashboard: dashboardData
    });
  } catch (error) {
    console.error('Get vendor dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor products
router.get('/:id/products', async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const { limit = 20, offset = 0 } = req.query;
    const products = await Vendor.getVendorProducts(vendorId, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      products,
      count: products.length
    });
  } catch (error) {
    console.error('Get vendor products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor statistics
router.get('/:id/stats', verifyToken, requireVendor, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    // Check if user can access this vendor's stats
    if (req.user.role !== 'admin' && req.user.id !== vendorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await Vendor.getVendorStats(vendorId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get vendor stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's vendor request status
router.get('/request/status', verifyToken, async (req, res) => {
  try {
    const request = await VendorRequest.findByUserId(req.user.id);
    
    if (!request) {
      return res.json({
        success: true,
        hasRequest: false,
        canApply: true
      });
    }

    res.json({
      success: true,
      hasRequest: true,
      canApply: request.status === 'rejected',
      request: {
        id: request.id,
        status: request.status,
        business_name: request.business_name,
        created_at: request.created_at,
        admin_notes: request.admin_notes
      }
    });
  } catch (error) {
    console.error('Get vendor request status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vendor request statistics (admin only)
router.get('/requests/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const stats = await VendorRequest.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get vendor request stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;