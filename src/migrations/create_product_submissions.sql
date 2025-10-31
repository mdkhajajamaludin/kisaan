-- Product Submission Requests Table
-- Users submit product requests that need admin approval before they can add products

CREATE TABLE IF NOT EXISTS product_submission_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  business_description TEXT,
  business_type VARCHAR(100),
  business_address TEXT,
  business_phone VARCHAR(20),
  business_email VARCHAR(255),
  tax_id VARCHAR(100),
  bank_account_info TEXT,
  product_categories TEXT[], -- Array of categories they want to sell
  estimated_products_count INTEGER,
  sample_product_description TEXT,
  reason_for_selling TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  admin_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Product Access Table
-- Tracks which users have been approved to add products
CREATE TABLE IF NOT EXISTS user_product_access (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  submission_request_id INTEGER REFERENCES product_submission_requests(id),
  is_approved BOOLEAN DEFAULT false,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  revoked_at TIMESTAMP,
  max_products INTEGER DEFAULT 100, -- Limit on number of products
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_submissions_user_id ON product_submission_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_product_submissions_status ON product_submission_requests(status);
CREATE INDEX IF NOT EXISTS idx_product_submissions_created ON product_submission_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_product_access_user_id ON user_product_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_product_access_approved ON user_product_access(is_approved) WHERE is_approved = true;

COMMENT ON TABLE product_submission_requests IS 'Stores user requests to gain product creation access';
COMMENT ON TABLE user_product_access IS 'Tracks which users have permission to create products';

