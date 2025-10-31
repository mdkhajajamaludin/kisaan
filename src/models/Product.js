const db = require('../config/database');

class Product {
  static async create(productData) {
    const { 
      name, description, price, original_price, category_id, vendor_id, 
      images = [], stock_quantity = 0, min_quantity = 1, weight, 
      origin_location, manufactured_date, expiry_date, harvest_date,
      organic_certified = true, tags = []
    } = productData;
    
    const query = `
      INSERT INTO products (
        name, description, price, original_price, category_id, vendor_id, 
        images, stock_quantity, min_quantity, weight, origin_location,
        manufactured_date, expiry_date, harvest_date, organic_certified, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    
    console.log('Product.create called with:', {
      name, description, price, original_price, category_id, vendor_id,
      stock_quantity, min_quantity, weight, origin_location,
      manufactured_date, expiry_date, harvest_date, organic_certified, tags
    });
    
    const result = await db.query(query, [
      name, description, price, original_price, category_id, vendor_id, 
      JSON.stringify(images), stock_quantity, min_quantity, weight, origin_location,
      manufactured_date || null, expiry_date || null, harvest_date || null, 
      organic_certified, JSON.stringify(tags)
    ]);
    
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT p.*, 
             CASE 
               WHEN p.category_id = 1 THEN 'Fruits'
               WHEN p.category_id = 2 THEN 'Vegetables'
               WHEN p.category_id = 3 THEN 'Grains'
               WHEN p.category_id = 4 THEN 'Desi Chicken'
               WHEN p.category_id = 5 THEN 'Rice'
               WHEN p.category_id = 6 THEN 'Honey'
               WHEN p.category_id = 7 THEN 'Dairy'
               WHEN p.category_id = 8 THEN 'Spices'
               WHEN p.category_id = 9 THEN 'Oils'
               WHEN p.category_id = 10 THEN 'Nuts & Seeds'
               ELSE 'Other'
             END as category_name
      FROM products p
      WHERE p.id = $1 AND p.is_active = true
    `;
    
    const result = await db.query(query, [id]);
    const product = result.rows[0];
    
    if (product) {
      // Parse JSON fields safely
      try {
        product.images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
        product.tags = typeof product.tags === 'string' ? JSON.parse(product.tags) : (product.tags || []);
      } catch (error) {
        console.error('Error parsing product JSON fields:', error);
        product.images = product.images || [];
        product.tags = product.tags || [];
      }
    }
    
    return product;
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT p.*, 
             CASE 
               WHEN p.category_id = 1 THEN 'Fruits'
               WHEN p.category_id = 2 THEN 'Vegetables'
               WHEN p.category_id = 3 THEN 'Grains'
               WHEN p.category_id = 4 THEN 'Desi Chicken'
               WHEN p.category_id = 5 THEN 'Rice'
               WHEN p.category_id = 6 THEN 'Honey'
               WHEN p.category_id = 7 THEN 'Dairy'
               WHEN p.category_id = 8 THEN 'Spices'
               WHEN p.category_id = 9 THEN 'Oils'
               WHEN p.category_id = 10 THEN 'Nuts & Seeds'
               ELSE 'Other'
             END as category_name
      FROM products p
      WHERE p.is_active = true
    `;
    
    const params = [];
    let paramCount = 0;

    if (filters.category_id) {
      paramCount++;
      query += ` AND p.category_id = $${paramCount}`;
      params.push(filters.category_id);
    }

    if (filters.search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
    }

    if (filters.min_price) {
      paramCount++;
      query += ` AND p.price >= $${paramCount}`;
      params.push(filters.min_price);
    }

    if (filters.max_price) {
      paramCount++;
      query += ` AND p.price <= $${paramCount}`;
      params.push(filters.max_price);
    }

    query += ` ORDER BY p.created_at DESC`;

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    const result = await db.query(query, params);
    
    // Parse JSON fields for all products
    const products = result.rows.map(product => {
      try {
        product.images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
        product.tags = typeof product.tags === 'string' ? JSON.parse(product.tags) : (product.tags || []);
      } catch (error) {
        console.error('Error parsing product JSON fields:', error);
        product.images = product.images || [];
        product.tags = product.tags || [];
      }
      return product;
    });
    
    return products;
  }

  static async getByCategory(categoryId, limit = 20, offset = 0) {
    const query = `
      SELECT p.*, 
             CASE 
               WHEN p.category_id = 1 THEN 'Fruits'
               WHEN p.category_id = 2 THEN 'Vegetables'
               WHEN p.category_id = 3 THEN 'Grains'
               WHEN p.category_id = 4 THEN 'Desi Chicken'
               WHEN p.category_id = 5 THEN 'Rice'
               WHEN p.category_id = 6 THEN 'Honey'
               WHEN p.category_id = 7 THEN 'Dairy'
               WHEN p.category_id = 8 THEN 'Spices'
               WHEN p.category_id = 9 THEN 'Oils'
               WHEN p.category_id = 10 THEN 'Nuts & Seeds'
               ELSE 'Other'
             END as category_name
      FROM products p
      WHERE p.category_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [categoryId, limit, offset]);
    return result.rows;
  }

  static async getByVendor(vendorId, limit = 20, offset = 0) {
    // This method is deprecated - vendors have been removed
    return [];
  }

  static async update(id, productData) {
    const { 
      name, description, price, original_price, category_id, images, 
      stock_quantity, min_quantity, weight, origin_location,
      manufactured_date, expiry_date, harvest_date, organic_certified, tags 
    } = productData;
    
    const query = `
      UPDATE products 
      SET name = COALESCE($2, name),
          description = COALESCE($3, description),
          price = COALESCE($4, price),
          original_price = COALESCE($5, original_price),
          category_id = COALESCE($6, category_id),
          images = COALESCE($7, images),
          stock_quantity = COALESCE($8, stock_quantity),
          min_quantity = COALESCE($9, min_quantity),
          weight = COALESCE($10, weight),
          origin_location = COALESCE($11, origin_location),
          manufactured_date = COALESCE($12, manufactured_date),
          expiry_date = COALESCE($13, expiry_date),
          harvest_date = COALESCE($14, harvest_date),
          organic_certified = COALESCE($15, organic_certified),
          tags = COALESCE($16, tags),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [
      id, name, description, price, original_price, category_id,
      images ? JSON.stringify(images) : null, stock_quantity, min_quantity,
      weight, origin_location, manufactured_date, expiry_date, harvest_date,
      organic_certified, tags ? JSON.stringify(tags) : null
    ]);
    
    return result.rows[0];
  }

  static async delete(id) {
    const query = `
      UPDATE products 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async updateStock(id, quantity) {
    const query = `
      UPDATE products 
      SET stock_quantity = stock_quantity - $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND stock_quantity >= $2
      RETURNING *
    `;
    
    const result = await db.query(query, [id, quantity]);
    return result.rows[0];
  }

  static async search(searchTerm, limit = 20, offset = 0) {
    const query = `
      SELECT p.*, 
             CASE 
               WHEN p.category_id = 1 THEN 'Fruits'
               WHEN p.category_id = 2 THEN 'Vegetables'
               WHEN p.category_id = 3 THEN 'Grains'
               WHEN p.category_id = 4 THEN 'Desi Chicken'
               WHEN p.category_id = 5 THEN 'Rice'
               WHEN p.category_id = 6 THEN 'Honey'
               WHEN p.category_id = 7 THEN 'Dairy'
               WHEN p.category_id = 8 THEN 'Spices'
               WHEN p.category_id = 9 THEN 'Oils'
               WHEN p.category_id = 10 THEN 'Nuts & Seeds'
               ELSE 'Other'
             END as category_name
      FROM products p
      WHERE p.is_active = true 
      AND (p.name ILIKE $1 OR p.description ILIKE $1 OR 
           CASE 
             WHEN p.category_id = 1 THEN 'Fruits'
             WHEN p.category_id = 2 THEN 'Vegetables'
             WHEN p.category_id = 3 THEN 'Grains'
             WHEN p.category_id = 4 THEN 'Desi Chicken'
             WHEN p.category_id = 5 THEN 'Rice'
             WHEN p.category_id = 6 THEN 'Honey'
             WHEN p.category_id = 7 THEN 'Dairy'
             WHEN p.category_id = 8 THEN 'Spices'
             WHEN p.category_id = 9 THEN 'Oils'
             WHEN p.category_id = 10 THEN 'Nuts & Seeds'
             ELSE 'Other'
           END ILIKE $1)
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [`%${searchTerm}%`, limit, offset]);
    return result.rows;
  }
}

module.exports = Product;