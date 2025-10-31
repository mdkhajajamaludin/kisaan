-- Migration: Add vendor access control columns
-- This ensures proper data isolation and access control for vendors

-- Add can_add_products column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'can_add_products') THEN
        ALTER TABLE users ADD COLUMN can_add_products BOOLEAN DEFAULT false;
        
        -- Grant product access to existing vendors
        UPDATE users SET can_add_products = true WHERE role = 'vendor';
        
        -- Grant product access to admins
        UPDATE users SET can_add_products = true WHERE role = 'admin';
        
        RAISE NOTICE 'Added can_add_products column to users table';
    END IF;
END $$;

-- Add is_active column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        RAISE NOTICE 'Added is_active column to users table';
    END IF;
END $$;

-- Create index for vendor queries
CREATE INDEX IF NOT EXISTS idx_users_vendor_access ON users(role, is_active, can_add_products) 
WHERE role IN ('vendor', 'admin');

-- Create index for vendor products
CREATE INDEX IF NOT EXISTS idx_products_vendor_active ON products(vendor_id, is_active);

-- Create index for vendor orders
CREATE INDEX IF NOT EXISTS idx_order_items_vendor ON order_items(product_id);

-- Update existing data to ensure consistency
UPDATE users SET is_active = true WHERE is_active IS NULL;
UPDATE users SET can_add_products = true WHERE role IN ('vendor', 'admin') AND can_add_products IS NULL;
UPDATE users SET can_add_products = false WHERE role = 'customer' AND can_add_products IS NULL;

-- Create a view for vendor analytics with proper data isolation
CREATE OR REPLACE VIEW vendor_analytics AS
SELECT 
    u.id as vendor_id,
    u.name as vendor_name,
    u.email as vendor_email,
    u.is_active,
    u.can_add_products,
    COUNT(DISTINCT p.id) as total_products,
    COUNT(DISTINCT CASE WHEN p.is_active = true THEN p.id END) as active_products,
    COUNT(DISTINCT o.id) as total_orders,
    COALESCE(SUM(DISTINCT oi.quantity * oi.price), 0) as total_revenue,
    COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.id END) as completed_orders,
    COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.id END) as pending_orders
FROM users u
LEFT JOIN products p ON u.id = p.vendor_id
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.id
WHERE u.role = 'vendor'
GROUP BY u.id, u.name, u.email, u.is_active, u.can_add_products;

-- Grant appropriate permissions
GRANT SELECT ON vendor_analytics TO PUBLIC;

COMMIT;