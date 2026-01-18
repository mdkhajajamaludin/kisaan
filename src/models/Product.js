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
        manufactured_date, expiry_date, harvest_date, organic_certified, tags, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)
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

  // Find product by ID without is_active filter (for ownership checks)
  static async findByIdForOwnership(id) {
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
      WHERE p.id = $1
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

  static async findAll(filters = {}, sortOptions = {}, paginationOptions = {}) {
    try {
      const {
        category_id,
        search,
        min_price,
        max_price,
        organic_only,
        vendor_id,
        is_active // undefined means all (if allowed), otherwise boolean
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
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 0;

      // Filter by active status if provided, otherwise default to true EXCEPT if vendor_id is present (then show all by default? or valid logic)
      // Actually simpler: if is_active is explicitly passed, use it. If not, default to true. 
      // To show ALL products, pass is_active: null or 'all' - but for boolean column this is tricky.
      // Let's say if is_active is undefined, we default to true. 
      // If we want to skip the check (get all), we need a flag. Let's assume strict filtering if passed.

      if (is_active !== undefined && is_active !== null && is_active !== 'all') {
        paramCount++;
        query += ` AND p.is_active = $${paramCount}`;
        params.push(is_active);
      } else if (is_active === undefined) {
        // Default behavior: show active only
        paramCount++;
        query += ` AND p.is_active = $${paramCount}`;
        params.push(true);
      }


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

      if (vendor_id) {
        paramCount++;
        query += ` AND p.vendor_id = $${paramCount}`;
        params.push(vendor_id);
      }



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

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total 
        FROM products p 
        WHERE 1=1
      `;
      const countParams = [];
      let countParamCount = 0;

      if (is_active !== undefined && is_active !== null && is_active !== 'all') {
        countParamCount++;
        countQuery += ` AND p.is_active = $${countParamCount}`;
        countParams.push(is_active);
      } else if (is_active === undefined) {
        countParamCount++;
        countQuery += ` AND p.is_active = $${countParamCount}`;
        countParams.push(true);
      }

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

      if (vendor_id) {
        countParamCount++;
        countQuery += ` AND p.vendor_id = $${countParamCount}`;
        countParams.push(vendor_id);
      }



      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      return {
        products,
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