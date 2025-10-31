const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const admin = require('./config/firebase');
const { performanceMonitor, requestLogger } = require('./middleware/performance');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Compression middleware - MUST be before other middleware
// Compresses all responses for lightning-fast performance
app.use(compression({
  level: 6, // Balanced compression level (0-9)
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Performance monitoring (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(requestLogger);
}
app.use(performanceMonitor);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://your-domain.com']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting - More generous limits for better UX
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased from 100 to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware with optimized settings
app.use(express.json({
  limit: '10mb',
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  parameterLimit: 10000
}));

// Request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/products', require('./routes/admin-products'));
app.use('/api/admin/audit-logs', require('./routes/audit-logs').router);
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/wishlist', require('./routes/wishlist'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'connected',
      firebase: admin.apps.length > 0 ? 'initialized' : 'not configured',
      email: process.env.EMAIL_USER ? 'configured' : 'not configured'
    }
  });
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// Cloudinary test endpoint
app.get('/api/test/cloudinary', (req, res) => {
  const { cloudinary } = require('./middleware/upload');
  
  res.json({
    message: 'Cloudinary configuration test',
    config: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY ? '***configured***' : 'missing',
      api_secret: process.env.CLOUDINARY_API_SECRET ? '***configured***' : 'missing'
    },
    cloudinary_config: {
      cloud_name: cloudinary.config().cloud_name,
      api_key: cloudinary.config().api_key ? '***configured***' : 'missing'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server with Socket.io
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);

// Setup Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://your-domain.com']
      : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Initialize Socket.IO handler for real-time notifications
const SocketHandler = require('./socket/socketHandler');
const socketHandler = new SocketHandler(io);

// Make io and socketHandler globally available for other modules
global.io = io;
global.socketHandler = socketHandler;

// Socket.io connection stats endpoint
app.get('/api/socket/stats', (req, res) => {
  res.json({
    success: true,
    stats: socketHandler.getStats(),
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⚡ Socket.io enabled for real-time notifications`);
  console.log(`📊 Multi-vendor e-commerce system ready!`);
  console.log(`🔗 API Health: http://localhost:${PORT}/api/health`);
});

module.exports = { app, server, io, socketHandler };