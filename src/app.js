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
    ? ['https://kisaan-sandy.vercel.app', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting - More generous limits for better UX
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased to 1000 requests per window for development
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

// Only apply rate limiting in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
}

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
app.use('/api/chat', require('./routes/chat'));

// Serve static files from uploads directory
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));



// Root Welcome Route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KisanHub Server</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                height: 100vh;
                margin: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
            }
            .container {
                text-align: center;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                padding: 3rem;
                border-radius: 20px;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                border: 1px solid rgba(255, 255, 255, 0.18);
                max-width: 90%;
            }
            h1 { font-size: 3.5rem; margin: 0 0 1rem 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
            p { font-size: 1.5rem; margin: 0 0 2rem 0; font-weight: 300; }
            .badge {
                display: inline-block;
                padding: 0.5rem 1.5rem;
                background: rgba(255,255,255,0.2);
                border-radius: 50px;
                font-size: 1rem;
                letter-spacing: 1px;
                text-transform: uppercase;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>KisanHub</h1>
            <p>Welcome to KisanHub</p>
            <div class="badge">Developed by Al Noor</div>
        </div>
    </body>
    </html>
  `);
});

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
      ? ['https://kisaan-sandy.vercel.app', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080']
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