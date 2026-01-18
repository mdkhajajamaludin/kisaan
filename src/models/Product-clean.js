const db = require('../config/database');

class Product {
  static async create(productData) {
    const { 
      name, description, price, original_price, category_id,
      images = [], stock_quantity = 0, min_quantity = 1, weight, 
      origin_location, manufactured_date, expiry_date, harvest_date,
      organic_certified = true, tags = []
    } = productData;
    
    const query = `
      INSERT INTO products (
        name, description, price, original_price, category_id,
        images, stock_quantity, min_quantity, weight, origin_location,
        manufactured_date, expiry_date, harvest_date, organic_certified, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
    console.log('Product.create called with:', {
      name, description, price, original_price, category_id,
      stock_quantity, min_quantity, weight, origin_location,
      manufactured_date, expiry_date, harvest_date, organic_certified, tags
    });
    
    const result = await db.query(query, [
      name, description, price, original_price, category_id,
      JSON.stringify(images), stock_quantity, min_quantity, weight, origin_location,
      manufactured_date || null, expiry_date || null, harvest_date || null, 
      organic_certified, JSON.stringify(tags)
    ]);
    
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT p.*, 
             c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  static async findAll(filters = {}, sortOptions = {}, paginationOptions = {}) {
    try {
      const { 
        category_id, 
        search, 
        min_price, 
        max_price, 
        organic_only,
        is_active = true 
      } = filters;
      
      const { 
        sort_by = 'created_at', 
        sort_order = 'desc' 
      } = sortOptions;
      
      const { 
        limit = 20, 
        offset = 0 
      } = paginationOptions;

      let query = `
        SELECT p.*, 
               c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = $1
      `;
      
      const params = [is_active];
      let paramCount = 1;

      // Apply filters
      if (category_id) {
        paramCount++;
        query += ` AND p.category_id = $${paramCount}`;
        params.push(category_id);
      }

      if (search) {
        paramCount++;
        query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      if (min_price) {
        paramCount++;
        query += ` AND p.price >= $${paramCount}`;
        params.push(min_price);
      }

      if (max_price) {
        paramCount++;
        query += ` AND p.price <= $${paramCount}`;
        params.push(max_price);
      }

      if (organic_only) {
        paramCount++;
        query += ` AND p.organic_certified = $${paramCount}`;
        params.push(true);
      }

      // Exclude test/mock products
      query += `
        AND p.name NOT ILIKE '%test%'
        AND p.name NOT ILIKE '%mock%'
        AND p.name NOT ILIKE '%admin product%'
        AND p.name NOT ILIKE '%unity%'
        AND p.name NOT ILIKE '%testing%'
      `;

      // Add sorting
      const validSortColumns = ['name', 'price', 'created_at', 'stock_quantity'];
      const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
      const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      
      query += ` ORDER BY p.${sortColumn} ${sortDirection}`;

      // Add pagination
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(limit);
      
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      console.log('Product.findAll query:', query);
      console.log('Product.findAll params:', params);

      const result = await db.query(query, params);

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total 
        FROM products p 
        WHERE p.is_active = $1
      `;
      const countParams = [is_active];
      let countParamCount = 1;

      if (category_id) {
        countParamCount++;
        countQuery += ` AND p.category_id = $${countParamCount}`;
        countParams.push(category_id);
      }

      if (search) {
        countParamCount++;
        countQuery += ` AND (p.name ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount})`;
        countParams.push(`%${search}%`);
      }

      if (min_price) {
        countParamCount++;
        countQuery += ` AND p.price >= $${countParamCount}`;
        countParams.push(min_price);
      }

      if (max_price) {
        countParamCount++;
        countQuery += ` AND p.price <= $${countParamCount}`;
        countParams.push(max_price);
      }

      if (organic_only) {
        countParamCount++;
        countQuery += ` AND p.organic_certified = $${countParamCount}`;
        countParams.push(true);
      }

      // Exclude test/mock products from count too
      countQuery += `
        AND p.name NOT ILIKE '%test%'
        AND p.name NOT ILIKE '%mock%'
        AND p.name NOT ILIKE '%admin product%'
        AND p.name NOT ILIKE '%unity%'
        AND p.name NOT ILIKE '%testing%'
      `;

      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      return {
        products: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Product.findAll error:', error);
      throw error;
    }
  }

  static async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 0;

    // Build dynamic update query
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        
        // Handle JSON fields
        if (key === 'images' || key === 'tags') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    paramCount++;
    const query = `
      UPDATE products 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    values.push(id);
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM products WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByCategory(categoryId, limit = 20, offset = 0) {
    const query = `
      SELECT p.*, 
             c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.category_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC
     