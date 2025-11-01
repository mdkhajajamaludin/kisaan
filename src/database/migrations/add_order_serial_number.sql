-- Migration: Add serial_number column to orders table for user-specific order numbering

-- Add serial_number column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS serial_number VARCHAR(50);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_orders_serial_number ON orders(serial_number);

-- Add comment for documentation
COMMENT ON COLUMN orders.serial_number IS 'User-specific order serial number (e.g., ORD-USERID-0001)';

-- Function to generate user-specific serial numbers
CREATE OR REPLACE FUNCTION generate_order_serial_number(user_id INTEGER)
RETURNS VARCHAR AS $$
DECLARE
    order_count INTEGER;
    serial_num VARCHAR(50);
BEGIN
    -- Count existing orders for this user
    SELECT COUNT(*) INTO order_count 
    FROM orders 
    WHERE user_id = user_id;
    
    -- Generate serial number: ORD-USERID-XXXX (where XXXX is padded order count)
    serial_num := 'ORD-' || user_id || '-' || LPAD((order_count + 1)::TEXT, 4, '0');
    
    RETURN serial_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically set serial number on order creation
CREATE OR REPLACE FUNCTION set_order_serial_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.serial_number IS NULL THEN
        NEW.serial_number := generate_order_serial_number(NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set serial number when inserting new orders
DROP TRIGGER IF EXISTS trigger_set_order_serial_number ON orders;
CREATE TRIGGER trigger_set_order_serial_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_order_serial_number();