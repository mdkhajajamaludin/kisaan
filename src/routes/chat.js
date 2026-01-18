const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(verifyToken);

// User routes
router.get('/session', chatController.getUserSession);
router.post('/request', chatController.requestChat);
router.get('/:sessionId/messages', chatController.getMessages);
router.post('/:sessionId/message', chatController.sendMessage);

// Admin routes
router.get('/admin/all', requireAdmin, chatController.getAdminChats);
router.put('/admin/:sessionId/accept', requireAdmin, chatController.acceptChat);
router.put('/admin/:sessionId/close', requireAdmin, chatController.closeChat);

module.exports = router;
