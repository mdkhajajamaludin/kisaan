const { Pool } = require('pg');
require('dotenv').config();

// Optimized connection pool for lightning-fast performance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Connection pool optimization
  max: 20, // Maximum number of clients in the pool
  min: 2, // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection cannot be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
  allowExitOnIdle: false, // Keep the pool alive even if all clients are idle

  // Query optimization
  statement_timeout: 30000, // Cancel queries that take longer than 30 seconds
  query_timeout: 30000, // Same as statement_timeout

  // Performance tuning
  application_name: 'zaitoon_marketplace',
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Test connection
pool.on('connect', (client) => {
  console.log('✅ Connected to PostgreSQL database');

  // Set session-level optimizations
  client.query(`
    SET work_mem = '16MB';
    SET maintenance_work_mem = '64MB';
    SET effective_cache_size = '256MB';
    SET random_page_cost = 1.1;
  `).catch(err => console.error('Failed to set session parameters:', err));
});

pool.on('error', (err, client) => {
  console.error('❌ Database connection error:', err);
});

pool.on('acquire', () => {
  // Uncomment for debugging connection pool usage
  // console.log('Client acquired from pool');
});

pool.on('remove', () => {
  // Uncomment for debugging connection pool usage
  // console.log('Client removed from pool');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Gracefully shutting down database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Gracefully shutting down database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};