-- Comprehensive Database Optimization for Vendor Management System
-- This script ensures all tables are properly set up and optimized

-- ============================================================================
-- CORE TABLES OPTIMIZATION
-- ============================================================================

-- Optimize Users table for vendor operations
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active) WHERE role = 'vendor';
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Optimize Products table for vendor queries
CREATE INDEX IF NOT EXISTS idx_products_vendor_active ON products(vendor_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_created_desc ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Optimize Orders table for vendor operations
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);

-- Optimize Order Items for vendor queries
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Optimize Notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ============================================================================
-- VENDOR REQUESTS TABLE
-- ============================================================================

-- Ensure vendor_requests table exists with proper structure
CREATE TABLE IF NOT EXISTS vendor_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(100),
  description TEXT,
  contact_info JSONB,
  documents JSONB,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for vendor_requests
CREATE INDEX IF NOT EXISTS idx_vendor_requests_user ON vendor_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_requests_status ON vendor_requests(status);
CREATE INDEX IF NOT EXISTS idx_vendor_requests_created ON vendor_requests(created_at DESC);

-- ============================================================================
-- NOTIFICATIONS TABLE OPTIMIZATION
-- ============================================================================

-- Ensure notifications table has proper structure
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optimize notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- ============================================================================
-- CATEGORIES TABLE
-- ============================================================================

-- Ensure categories table exists
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  image_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories if they don't exist
INSERT INTO categories (id, name, description) VALUES
  (1, 'Fruits', 'Fresh organic fruits'),
  (2, 'Vegetables', 'Fresh organic vegetables'),
  (3, 'Grains', 'Organic grains and cereals'),
  (4, 'Desi Chicken', 'Free-range desi chicken'),
  (5, 'Rice', 'Organic rice varieties'),
  (6, 'Honey', 'Pure natural honey'),
  (7, 'Dairy', 'Fresh dairy products'),
  (8, 'Spices', 'Organic spices and herbs'),
  (9, 'Oils', 'Cold-pressed organic oils'),
  (10, 'Nuts & Seeds', 'Organic nuts and seeds')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- ============================================================================
-- PERFORMANCE OPTIMIZATIONS
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE users;
ANALYZE products;
ANALYZE orders;
ANALYZE order_items;
ANALYZE notifications;
ANALYZE vendor_requests;
ANALYZE categories;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- ============================================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all relevant tables
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendor_requests_updated_at ON vendor_requests;
CREATE TRIGGER update_vendor_requests_updated_at BEFORE UPDATE ON vendor_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CLEANUP OLD DATA
-- ============================================================================

-- Function to cleanup old notifications (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
    AND read = TRUE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VENDOR ANALYTICS VIEWS
-- ============================================================================

-- Create a view for vendor analytics
CREATE OR REPLACE VIEW vendor_analytics AS
SELECT 
    u.id as vendor_id,
    u.name as vendor_name,
    u.email as vendor_email,
    u.is_active as vendor_active,
    COUNT(DISTINCT p.id) as total_products,
    COUNT(DISTINCT CASE WHEN p.is_active = TRUE THEN p.id END) as active_products,
    COUNT(DISTINCT CASE WHEN p.stock_quantity = 0 THEN p.id END) as out_of_stock_products,
    COUNT(DISTINCT CASE WHEN p.stock_quantity <= 5 AND p.stock_quantity > 0 THEN p.id END) as low_stock_products,
    COUNT(DISTINCT o.id) as total_orders,
    COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.id END) as completed_orders,
    COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) as total_revenue,
    COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) as avg_order_value
FROM users u
LEFT JOIN products p ON u.id = p.vendor_id
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.id
WHERE u.role = 'vendor'
GROUP BY u.id, u.name, u.email, u.is_active;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Database optimization completed successfully!';
    RAISE NOTICE 'All vendor management tables are now optimized for performance.';
END $$;