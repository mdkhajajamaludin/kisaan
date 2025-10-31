const jwt = require('jsonwebtoken');
const User = require('../models/User');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // Map of userId -> socketId
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('🔌 New socket connection:', socket.id);

      // Handle user authentication
      socket.on('authenticate', async (data) => {
        try {
          const { token } = data;
          
          if (!token) {
            socket.emit('auth_error', { message: 'No token provided' });
            return;
          }

          // Verify Firebase token (you might need to adjust this based on your auth setup)
          const decoded = jwt.decode(token);
          if (!decoded || !decoded.email) {
            socket.emit('auth_error', { message: 'Invalid token' });
            return;
          }

          // Find user in database
          const user = await User.findByEmail(decoded.email);
          if (!user) {
            socket.emit('auth_error', { message: 'User not found' });
            return;
          }

          // Store user connection
          socket.userId = user.id;
          socket.userRole = user.role;
          this.connectedUsers.set(user.id, socket.id);

          // Join user-specific room
          socket.join(`user_${user.id}`);
          
          // Join role-specific rooms
          if (user.role === 'vendor') {
            socket.join('vendors');
          } else if (user.role === 'admin') {
            socket.join('admins');
          }

          socket.emit('authenticated', { 
            userId: user.id, 
            role: user.role,
            message: 'Successfully authenticated' 
          });

          console.log(`✅ User ${user.email} (${user.role}) authenticated on socket ${socket.id}`);
        } catch (error) {
          console.error('Socket authentication error:', error);
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
          console.log(`👋 User ${socket.userId} disconnected from socket ${socket.id}`);
        } else {
          console.log(`👋 Anonymous user disconnected from socket ${socket.id}`);
        }
      });

      // Handle vendor-specific events
      socket.on('vendor:join_dashboard', () => {
        if (socket.userRole === 'vendor') {
          socket.join(`vendor_dashboard_${socket.userId}`);
          console.log(`📊 Vendor ${socket.userId} joined dashboard room`);
        }
      });

      // Handle admin-specific events
      socket.on('admin:join_panel', () => {
        if (socket.userRole === 'admin') {
          socket.join('admin_panel');
          console.log(`👑 Admin ${socket.userId} joined admin panel room`);
        }
      });

      // Handle order tracking
      socket.on('track_order', (orderId) => {
        socket.join(`order_${orderId}`);
        console.log(`📦 User ${socket.userId} tracking order ${orderId}`);
      });
    });
  }

  // Send notification to specific user
  notifyUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(`user_${userId}`).emit(event, data);
      console.log(`📢 Sent ${event} to user ${userId}`);
      return true;
    }
    console.log(`⚠️  User ${userId} not connected for ${event}`);
    return false;
  }

  // Send notification to all vendors
  notifyVendors(event, data) {
    this.io.to('vendors').emit(event, data);
    console.log(`📢 Sent ${event} to all vendors`);
  }

  // Send notification to all admins (use sparingly - prefer targeted notifications)
  notifyAdmins(event, data) {
    this.io.to('admins').emit(event, data);
    console.log(`📢 Sent ${event} to all admins`);
  }

  // Send order update to all parties involved
  notifyOrderUpdate(orderId, data) {
    this.io.to(`order_${orderId}`).emit('order:updated', data);
    console.log(`📦 Sent order update for order ${orderId}`);
  }

  // Vendor-specific notifications
  notifyVendorNewOrder(vendorId, orderData) {
    this.notifyUser(vendorId, 'vendor:new_order', orderData);
  }

  notifyVendorOrderUpdate(vendorId, orderData) {
    this.notifyUser(vendorId, 'vendor:order_update', orderData);
  }

  notifyVendorApproval(vendorId, approvalData) {
    this.notifyUser(vendorId, 'vendor:approved', approvalData);
  }

  notifyVendorStatusChange(vendorId, statusData) {
    this.notifyUser(vendorId, 'vendor:status_changed', statusData);
  }

  // Customer notifications
  notifyCustomerOrderUpdate(customerId, orderData) {
    this.notifyUser(customerId, 'order:status_updated', orderData);
  }

  // Admin notifications (only for admin-specific events)
  notifyAdminNewVendorRequest(requestData) {
    this.notifyAdmins('admin:new_vendor_request', requestData);
  }

  // Note: Order notifications should go to customers and vendors only, not admins
  // Admins can view orders through the dashboard without real-time notifications

  // Get connection stats
  getStats() {
    return {
      total_connections: this.io.engine.clientsCount,
      authenticated_users: this.connectedUsers.size,
      rooms: Object.keys(this.io.sockets.adapter.rooms)
    };
  }
}

module.exports = SocketHandler;