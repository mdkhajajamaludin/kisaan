const nodemailer = require('nodemailer');
const db = require('../config/database');

class EmailService {
  constructor() {
    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        this.transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: process.env.EMAIL_PORT || 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });
        console.log('Email service initialized successfully');
      } else {
        console.warn('Email service not configured - missing EMAIL_USER or EMAIL_PASS');
        this.transporter = null;
      }
    } catch (error) {
      console.error('Email service initialization error:', error.message);
      this.transporter = null;
    }
  }

  async sendEmail(to, subject, html, templateType = null) {
    try {
      // Log email to database
      const logQuery = `
        INSERT INTO email_notifications (recipient_email, subject, body, template_type)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;
      
      const logResult = await db.query(logQuery, [to, subject, html, templateType]);
      const emailId = logResult.rows[0].id;

      // Check if transporter is available
      if (!this.transporter) {
        console.warn('Email not sent - transporter not configured');
        await db.query(
          'UPDATE email_notifications SET status = $1 WHERE id = $2',
          ['skipped', emailId]
        );
        return { success: false, error: 'Email service not configured' };
      }

      // Send email
      const mailOptions = {
        from: `"Zaitoon Marketplace" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
      };

      const result = await this.transporter.sendMail(mailOptions);

      // Update email status
      await db.query(
        'UPDATE email_notifications SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['sent', emailId]
      );

      console.log('Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };

    } catch (error) {
      console.error('Email sending error:', error);
      
      // Update email status to failed
      if (logResult && logResult.rows[0]) {
        await db.query(
          'UPDATE email_notifications SET status = $1 WHERE id = $2',
          ['failed', logResult.rows[0].id]
        );
      }
      
      return { success: false, error: error.message };
    }
  }

  // Welcome email for new users
  async sendWelcomeEmail(userEmail, userName) {
    const subject = 'Welcome to Zaitoon Marketplace!';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5530;">Welcome to Zaitoon Marketplace, ${userName}!</h2>
        <p>Thank you for joining our marketplace. We're excited to have you as part of our community.</p>
        <p>You can now:</p>
        <ul>
          <li>Browse thousands of products</li>
          <li>Add items to your cart and wishlist</li>
          <li>Track your orders</li>
          <li>Apply to become a vendor</li>
        </ul>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Happy shopping!</p>
        <p><strong>The Zaitoon Marketplace Team</strong></p>
      </div>
    `;
    
    return await this.sendEmail(userEmail, subject, html, 'welcome');
  }

  // Vendor application notification to admin
  async sendVendorApplicationNotification(adminEmail, applicantName, businessName) {
    const subject = 'New Vendor Application - Zaitoon Marketplace';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5530;">New Vendor Application</h2>
        <p>A new vendor application has been submitted:</p>
        <ul>
          <li><strong>Applicant:</strong> ${applicantName}</li>
          <li><strong>Business Name:</strong> ${businessName}</li>
        </ul>
        <p>Please review the application in the admin panel.</p>
        <p><strong>Zaitoon Marketplace System</strong></p>
      </div>
    `;
    
    return await this.sendEmail(adminEmail, subject, html, 'vendor_application');
  }

  // Vendor approval email
  async sendVendorApprovalEmail(vendorEmail, vendorName, businessName) {
    const subject = 'Vendor Application Approved - Zaitoon Marketplace';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5530;">Congratulations! Your Vendor Application is Approved</h2>
        <p>Dear ${vendorName},</p>
        <p>We're pleased to inform you that your vendor application for <strong>${businessName}</strong> has been approved!</p>
        <p>You can now:</p>
        <ul>
          <li>Access your vendor dashboard</li>
          <li>Add and manage products</li>
          <li>Track orders and sales</li>
          <li>Manage your inventory</li>
        </ul>
        <p>Welcome to the Zaitoon Marketplace vendor community!</p>
        <p><strong>The Zaitoon Marketplace Team</strong></p>
      </div>
    `;
    
    return await this.sendEmail(vendorEmail, subject, html, 'vendor_approval');
  }

  // Vendor rejection email
  async sendVendorRejectionEmail(vendorEmail, vendorName, reason) {
    const subject = 'Vendor Application Update - Zaitoon Marketplace';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5530;">Vendor Application Update</h2>
        <p>Dear ${vendorName},</p>
        <p>Thank you for your interest in becoming a vendor on Zaitoon Marketplace.</p>
        <p>After careful review, we are unable to approve your application at this time.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>You are welcome to reapply in the future. If you have any questions, please contact our support team.</p>
        <p><strong>The Zaitoon Marketplace Team</strong></p>
      </div>
    `;
    
    return await this.sendEmail(vendorEmail, subject, html, 'vendor_rejection');
  }

  // Order confirmation email
  async sendOrderConfirmationEmail(customerEmail, customerName, order, orderItems) {
    const subject = `Order Confirmation #${order.id} - Zaitoon Marketplace`;
    
    const itemsHtml = orderItems.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.price}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5530;">Order Confirmation</h2>
        <p>Dear ${customerName},</p>
        <p>Thank you for your order! Here are the details:</p>
        
        <div style="background: #f9f9f9; padding: 15px; margin: 20px 0;">
          <h3>Order #${order.id}</h3>
          <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
          <p><strong>Status:</strong> ${order.status}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="padding: 10px; text-align: left;">Product</th>
              <th style="padding: 10px; text-align: center;">Quantity</th>
              <th style="padding: 10px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr style="background: #f0f0f0; font-weight: bold;">
              <td colspan="2" style="padding: 10px;">Total</td>
              <td style="padding: 10px; text-align: right;">$${order.total_amount}</td>
            </tr>
          </tfoot>
        </table>

        <p>We'll send you another email when your order ships.</p>
        <p><strong>The Zaitoon Marketplace Team</strong></p>
      </div>
    `;
    
    return await this.sendEmail(customerEmail, subject, html, 'order_confirmation');
  }

  // Order status update email
  async sendOrderStatusUpdateEmail(customerEmail, customerName, order, newStatus) {
    const subject = `Order #${order.id} Status Update - Zaitoon Marketplace`;
    
    const statusMessages = {
      processing: 'Your order is being processed and will be shipped soon.',
      shipped: 'Your order has been shipped and is on its way to you.',
      delivered: 'Your order has been delivered. We hope you enjoy your purchase!',
      cancelled: 'Your order has been cancelled. If you have any questions, please contact support.'
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5530;">Order Status Update</h2>
        <p>Dear ${customerName},</p>
        <p>Your order #${order.id} status has been updated to: <strong>${newStatus}</strong></p>
        <p>${statusMessages[newStatus] || 'Your order status has been updated.'}</p>
        <p>You can track your order status in your account dashboard.</p>
        <p><strong>The Zaitoon Marketplace Team</strong></p>
      </div>
    `;
    
    return await this.sendEmail(customerEmail, subject, html, 'order_status_update');
  }

  // Low stock alert for vendors
  async sendLowStockAlert(vendorEmail, vendorName, products) {
    const subject = 'Low Stock Alert - Zaitoon Marketplace';
    
    const productsHtml = products.map(product => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${product.name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; color: red;">
          <strong>${product.stock_quantity}</strong>
        </td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5530;">Low Stock Alert</h2>
        <p>Dear ${vendorName},</p>
        <p>The following products are running low on stock:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="padding: 10px; text-align: left;">Product Name</th>
              <th style="padding: 10px; text-align: center;">Stock Remaining</th>
            </tr>
          </thead>
          <tbody>
            ${productsHtml}
          </tbody>
        </table>

        <p>Please update your inventory to avoid stockouts.</p>
        <p><strong>The Zaitoon Marketplace Team</strong></p>
      </div>
    `;
    
    return await this.sendEmail(vendorEmail, subject, html, 'low_stock_alert');
  }
}

module.exports = new EmailService();