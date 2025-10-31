// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const admin = require('../src/config/firebase');
const { performanceMonitor, requestLogger } = require('../src/middleware/performance');
require('dotenv').config();

const app = express();

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Performance monitoring
if (process.env.NODE_ENV !== 'production') {
  app.use(requestLogger);
}
app.use(performanceMonitor);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['https://kisaan-sandy.vercel.app', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080', 'http://localhost:8081'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
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

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/users', require('../src/routes/users'));
app.use('/api/products', require('../src/routes/products'));
app.use('/api/orders', require('../src/routes/orders'));
app.use('/api/admin', require('../src/routes/admin'));
app.use('/api/admin/products', require('../src/routes/admin-products'));
app.use('/api/admin/audit-logs', require('../src/routes/audit-logs').router);
app.use('/api/addresses', require('../src/routes/addresses'));
app.use('/api/notifications', require('../src/routes/notifications'));
app.use('/api/cart', require('../src/routes/cart'));
app.use('/api/wishlist', require('../src/routes/wishlist'));

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

// Export for Vercel
module.exports = app;
