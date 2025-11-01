const db = require('./src/config/database');

async function testAnalytics() {
  try {
    console.log('Testing analytics queries...\n');

    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    const prevStartDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Test 1: Current period query
    console.log('1. Testing current period query...');
    const currentPeriodQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status != 'cancelled'
    `;
    try {
      const result = await db.query(currentPeriodQuery, [startDate, endDate]);
      console.log('✅ Current period query successful');
      console.log('   Stats:', result.rows[0]);
    } catch (error) {
      console.error('❌ Current period query failed:', error.message);
    }

    // Test 2: Customers query
    console.log('\n2. Testing customers query...');
    const customersQuery = `
      SELECT COUNT(DISTINCT user_id) as total_customers
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
    `;
    try {
      const result = await db.query(customersQuery, [startDate, endDate]);
      console.log('✅ Customers query successful');
      console.log('   Customers:', result.rows[0]);
    } catch (error) {
      console.error('❌ Customers query failed:', error.message);
    }

    // Test 3: Daily revenue query
    console.log('\n3. Testing daily revenue query...');
    const dailyRevenueQuery = `
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `;
    try {
      const result = await db.query(dailyRevenueQuery, [startDate, endDate]);
      console.log('✅ Daily revenue query successful');
      console.log('   Rows:', result.rows.length);
    } catch (error) {
      console.error('❌ Daily revenue query failed:', error.message);
    }

    // Test 4: Top products query
    console.log('\n4. Testing top products query...');
    const topProductsQuery = `
      SELECT 
        p.id, p.name,
        SUM(oi.quantity) as sales,
        SUM(oi.quantity * oi.price) as revenue
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at BETWEEN $1 AND $2 AND o.status != 'cancelled'
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 5
    `;
    try {
      const result = await db.query(topProductsQuery, [startDate, endDate]);
      console.log('✅ Top products query successful');
      console.log('   Products:', result.rows.length);
    } catch (error) {
      console.error('❌ Top products query failed:', error.message);
    }

    // Test 5: Status distribution query
    console.log('\n5. Testing status distribution query...');
    const statusDistQuery = `
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY status
    `;
    try {
      const result = await db.query(statusDistQuery, [startDate, endDate]);
      console.log('✅ Status distribution query successful');
      console.log('   Statuses:', result.rows.length);
    } catch (error) {
      console.error('❌ Status distribution query failed:', error.message);
    }

    // Test 6: User growth query
    console.log('\n6. Testing user growth query...');
    const userGrowthQuery = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `;
    try {
      const result = await db.query(userGrowthQuery, [startDate, endDate]);
      console.log('✅ User growth query successful');
      console.log('   Days:', result.rows.length);
    } catch (error) {
      console.error('❌ User growth query failed:', error.message);
    }

    // Test 7: Recent activity query
    console.log('\n7. Testing recent activity query...');
    const recentActivityQuery = `
      SELECT
        'order' as type,
        o.id,
        'Order #' || o.id || ' placed' as action,
        o.created_at,
        u.name as user_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.created_at >= NOW() - INTERVAL '24 hours'
      UNION ALL
      SELECT
        'product' as type,
        p.id,
        'Product "' || p.name || '" added' as action,
        p.created_at,
        u.name as user_name
      FROM products p
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE p.created_at >= NOW() - INTERVAL '24 hours'
      UNION ALL
      SELECT
        'user' as type,
        u.id,
        'User "' || u.name || '" registered' as action,
        u.created_at,
        u.name as user_name
      FROM users u
      WHERE u.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `;
    try {
      const result = await db.query(recentActivityQuery);
      console.log('✅ Recent activity query successful');
      console.log('   Activities:', result.rows.length);
    } catch (error) {
      console.error('❌ Recent activity query failed:', error.message);
    }

    // Test 8: Page views query
    console.log('\n8. Testing page views query...');
    const pageViewsQuery = `
      SELECT COALESCE(SUM(view_count), 0) as total_views
      FROM products
    `;
    try {
      const result = await db.query(pageViewsQuery);
      console.log('✅ Page views query successful');
      console.log('   Views:', result.rows[0]);
    } catch (error) {
      console.error('❌ Page views query failed:', error.message);
      console.error('   Error details:', error);
    }

    // Test 9: Average session query
    console.log('\n9. Testing average session query...');
    const avgSessionQuery = `
      SELECT
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration
      FROM orders
      WHERE created_at BETWEEN $1 AND $2 AND status = 'completed'
    `;
    try {
      const result = await db.query(avgSessionQuery, [startDate, endDate]);
      console.log('✅ Average session query successful');
      console.log('   Duration:', result.rows[0]);
    } catch (error) {
      console.error('❌ Average session query failed:', error.message);
    }

    console.log('\n✅ All tests complete');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite error:', error);
    process.exit(1);
  }
}

testAnalytics();
