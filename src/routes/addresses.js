const express = require('express');
const router = express.Router();
const Address = require('../models/Address');
const { verifyToken } = require('../middleware/auth');
const Joi = require('joi');

// Validation schemas
const createAddressSchema = Joi.object({
  name: Joi.string().required(),
  street: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  zip_code: Joi.string().required(),
  country: Joi.string().default('India'),
  phone: Joi.string().optional(),
  is_default: Joi.boolean().default(false)
});

const updateAddressSchema = Joi.object({
  name: Joi.string().optional(),
  street: Joi.string().optional(),
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  zip_code: Joi.string().optional(),
  country: Joi.string().optional(),
  phone: Joi.string().optional(),
  is_default: Joi.boolean().optional()
});

// Get all addresses for the authenticated user
router.get('/', verifyToken, async (req, res) => {
  try {
    const addresses = await Address.findByUserId(req.user.id);
    
    res.json({
      success: true,
      addresses
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific address
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const addressId = parseInt(req.params.id);
    if (isNaN(addressId)) {
      return res.status(400).json({ error: 'Invalid address ID' });
    }

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // Check if user owns this address
    if (address.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      address
    });
  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new address
router.post('/', verifyToken, async (req, res) => {
  try {
    const { error, value } = createAddressSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const addressData = {
      ...value,
      user_id: req.user.id
    };

    const address = await Address.create(addressData);

    res.status(201).json({
      success: true,
      message: 'Address created successfully',
      address
    });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an address
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const addressId = parseInt(req.params.id);
    if (isNaN(addressId)) {
      return res.status(400).json({ error: 'Invalid address ID' });
    }

    const { error, value } = updateAddressSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if address exists and user owns it
    const existingAddress = await Address.findById(addressId);
    if (!existingAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }

    if (existingAddress.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedAddress = await Address.update(addressId, value);

    res.json({
      success: true,
      message: 'Address updated successfully',
      address: updatedAddress
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete an address
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const addressId = parseInt(req.params.id);
    if (isNaN(addressId)) {
      return res.status(400).json({ error: 'Invalid address ID' });
    }

    // Check if address exists and user owns it
    const existingAddress = await Address.findById(addressId);
    if (!existingAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }

    if (existingAddress.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Address.delete(addressId);

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set an address as default
router.put('/:id/default', verifyToken, async (req, res) => {
  try {
    const addressId = parseInt(req.params.id);
    if (isNaN(addressId)) {
      return res.status(400).json({ error: 'Invalid address ID' });
    }

    // Check if address exists and user owns it
    const existingAddress = await Address.findById(addressId);
    if (!existingAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }

    if (existingAddress.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedAddress = await Address.setDefault(addressId, req.user.id);

    res.json({
      success: true,
      message: 'Default address updated successfully',
      address: updatedAddress
    });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get default address
router.get('/default/address', verifyToken, async (req, res) => {
  try {
    const defaultAddress = await Address.getDefault(req.user.id);
    
    res.json({
      success: true,
      address: defaultAddress
    });
  } catch (error) {
    console.error('Get default address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;