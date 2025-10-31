const db = require('../config/database');

class Address {
  static async create(addressData) {
    const { 
      user_id, 
      name, 
      street, 
      city, 
      state, 
      zip_code, 
      country = 'India', 
      phone, 
      is_default = false 
    } = addressData;
    
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // If this is set as default, unset all other default addresses for this user
      if (is_default) {
        await client.query(
          'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
          [user_id]
        );
      }
      
      const query = `
        INSERT INTO user_addresses (user_id, name, street, city, state, zip_code, country, phone, is_default)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      
      const result = await client.query(query, [
        user_id, name, street, city, state, zip_code, country, phone, is_default
      ]);
      
      await client.query('COMMIT');
      return result.rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findById(id) {
    const query = 'SELECT * FROM user_addresses WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const query = `
      SELECT * FROM user_addresses 
      WHERE user_id = $1 
      ORDER BY is_default DESC, created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  static async update(id, addressData) {
    const { 
      name, 
      street, 
      city, 
      state, 
      zip_code, 
      country, 
      phone, 
      is_default 
    } = addressData;
    
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the address to find the user_id
      const addressResult = await client.query('SELECT user_id FROM user_addresses WHERE id = $1', [id]);
      if (addressResult.rows.length === 0) {
        throw new Error('Address not found');
      }
      
      const userId = addressResult.rows[0].user_id;
      
      // If this is set as default, unset all other default addresses for this user
      if (is_default) {
        await client.query(
          'UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND id != $2',
          [userId, id]
        );
      }
      
      const query = `
        UPDATE user_addresses 
        SET name = COALESCE($2, name),
            street = COALESCE($3, street),
            city = COALESCE($4, city),
            state = COALESCE($5, state),
            zip_code = COALESCE($6, zip_code),
            country = COALESCE($7, country),
            phone = COALESCE($8, phone),
            is_default = COALESCE($9, is_default),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await client.query(query, [
        id, name, street, city, state, zip_code, country, phone, is_default
      ]);
      
      await client.query('COMMIT');
      return result.rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(id) {
    const query = 'DELETE FROM user_addresses WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async setDefault(id, userId) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Unset all default addresses for this user
      await client.query(
        'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
        [userId]
      );
      
      // Set this address as default
      const result = await client.query(
        'UPDATE user_addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getDefault(userId) {
    const query = 'SELECT * FROM user_addresses WHERE user_id = $1 AND is_default = true';
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
}

module.exports = Address;