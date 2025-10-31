/**
 * Performance monitoring middleware
 * Tracks response times and logs slow queries
 */

const performanceMonitor = (req, res, next) => {
  const start = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override end function to measure response time
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      console.warn(`⚠️  SLOW REQUEST: ${req.method} ${req.path} took ${duration}ms`);
    }
    
    // Add performance header
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    // Call original end function
    originalEnd.apply(res, args);
  };
  
  next();
};

/**
 * Request logger middleware
 * Logs all incoming requests with timing
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    const resetColor = '\x1b[0m';
    
    console.log(
      `${statusColor}${res.statusCode}${resetColor} ${req.method} ${req.path} - ${duration}ms`
    );
  });
  
  next();
};

/**
 * Cache control middleware
 * Sets appropriate cache headers based on route
 */
const cacheControl = (options = {}) => {
  return (req, res, next) => {
    const {
      maxAge = 0,
      isPrivate = true,
      noCache = false,
      noStore = false
    } = options;
    
    if (noStore) {
      res.set('Cache-Control', 'no-store');
    } else if (noCache) {
      res.set('Cache-Control', 'no-cache');
    } else {
      const cacheType = isPrivate ? 'private' : 'public';
      res.set('Cache-Control', `${cacheType}, max-age=${maxAge}`);
    }
    
    next();
  };
};

/**
 * ETag support for conditional requests
 * Reduces bandwidth by sending 304 Not Modified when content hasn't changed
 */
const etag = require('etag');

const conditionalGet = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Generate ETag from response data
    const responseEtag = etag(JSON.stringify(data));
    
    // Set ETag header
    res.setHeader('ETag', responseEtag);
    
    // Check if client has cached version
    const clientEtag = req.headers['if-none-match'];
    
    if (clientEtag === responseEtag) {
      // Content hasn't changed, send 304
      res.status(304).end();
    } else {
      // Content changed, send full response
      originalJson.call(this, data);
    }
  };
  
  next();
};

module.exports = {
  performanceMonitor,
  requestLogger,
  cacheControl,
  conditionalGet
};

