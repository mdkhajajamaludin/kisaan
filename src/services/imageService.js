const { cloudinary, getPublicIdFromUrl, deleteImage } = require('../middleware/upload');

class ImageService {
  // Process uploaded files (files are already uploaded to Cloudinary via multer)
  static processUploadedFiles(files) {
    try {
      console.log('Processing files:', files.map(f => ({ 
        path: f.path, 
        filename: f.filename, 
        originalname: f.originalname 
      })));
      
      return files.map(file => ({
        url: file.path, // Cloudinary URL
        publicId: file.filename, // Cloudinary public ID
        originalName: file.originalname,
        size: file.size
      }));
    } catch (error) {
      console.error('File processing error:', error);
      throw new Error('Failed to process uploaded files');
    }
  }

  // Upload single image (for manual uploads)
  static async uploadImage(file, folder = 'products') {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: `zaitoon-marketplace/${folder}`,
        transformation: [
          { width: 800, height: 600, crop: 'limit' },
          { quality: 'auto' }
        ]
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height
      };
    } catch (error) {
      console.error('Image upload error:', error);
      throw new Error('Failed to upload image');
    }
  }

  // Upload multiple images (for manual uploads)
  static async uploadMultipleImages(files, folder = 'products') {
    try {
      const uploadPromises = files.map(file => this.uploadImage(file, folder));
      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error('Multiple images upload error:', error);
      throw new Error('Failed to upload images');
    }
  }

  // Delete image by URL
  static async deleteImageByUrl(imageUrl) {
    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      if (!publicId) {
        throw new Error('Invalid image URL');
      }

      const result = await deleteImage(publicId);
      return result;
    } catch (error) {
      console.error('Image deletion error:', error);
      throw new Error('Failed to delete image');
    }
  }

  // Delete multiple images by URLs
  static async deleteMultipleImages(imageUrls) {
    try {
      const deletePromises = imageUrls.map(url => this.deleteImageByUrl(url));
      const results = await Promise.allSettled(deletePromises);
      
      const successful = results.filter(result => result.status === 'fulfilled');
      const failed = results.filter(result => result.status === 'rejected');
      
      return {
        successful: successful.length,
        failed: failed.length,
        errors: failed.map(result => result.reason.message)
      };
    } catch (error) {
      console.error('Multiple images deletion error:', error);
      throw new Error('Failed to delete images');
    }
  }

  // Generate thumbnail
  static generateThumbnail(imageUrl, width = 200, height = 200) {
    try {
      // Extract the base URL and add transformation parameters
      const urlParts = imageUrl.split('/upload/');
      if (urlParts.length !== 2) {
        return imageUrl; // Return original if can't parse
      }

      const transformation = `c_fill,w_${width},h_${height},q_auto`;
      return `${urlParts[0]}/upload/${transformation}/${urlParts[1]}`;
    } catch (error) {
      console.error('Thumbnail generation error:', error);
      return imageUrl; // Return original URL on error
    }
  }

  // Generate different sizes for responsive images
  static generateResponsiveImages(imageUrl) {
    try {
      const sizes = {
        thumbnail: this.generateThumbnail(imageUrl, 150, 150),
        small: this.generateThumbnail(imageUrl, 300, 300),
        medium: this.generateThumbnail(imageUrl, 600, 600),
        large: imageUrl // Original size
      };

      return sizes;
    } catch (error) {
      console.error('Responsive images generation error:', error);
      return {
        thumbnail: imageUrl,
        small: imageUrl,
        medium: imageUrl,
        large: imageUrl
      };
    }
  }

  // Optimize image for web
  static optimizeForWeb(imageUrl, quality = 'auto') {
    try {
      const urlParts = imageUrl.split('/upload/');
      if (urlParts.length !== 2) {
        return imageUrl;
      }

      const transformation = `q_${quality},f_auto`;
      return `${urlParts[0]}/upload/${transformation}/${urlParts[1]}`;
    } catch (error) {
      console.error('Image optimization error:', error);
      return imageUrl;
    }
  }

  // Validate image file
  static validateImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }

    if (file.size > maxSize) {
      throw new Error('File size too large. Maximum 5MB allowed.');
    }

    return true;
  }

  // Process product images
  static async processProductImages(images) {
    try {
      const processedImages = images.map(imageUrl => ({
        url: imageUrl,
        thumbnail: this.generateThumbnail(imageUrl, 200, 200),
        optimized: this.optimizeForWeb(imageUrl),
        responsive: this.generateResponsiveImages(imageUrl)
      }));

      return processedImages;
    } catch (error) {
      console.error('Product images processing error:', error);
      throw new Error('Failed to process product images');
    }
  }

  // Clean up orphaned images (images not referenced in database)
  static async cleanupOrphanedImages() {
    try {
      // This would require a more complex implementation
      // to check which images are referenced in the database
      // and delete those that aren't
      console.log('Orphaned images cleanup not implemented yet');
      return { message: 'Cleanup functionality not implemented' };
    } catch (error) {
      console.error('Cleanup error:', error);
      throw new Error('Failed to cleanup orphaned images');
    }
  }

  // Get image metadata
  static async getImageMetadata(imageUrl) {
    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      if (!publicId) {
        throw new Error('Invalid image URL');
      }

      const result = await cloudinary.api.resource(publicId);
      return {
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        createdAt: result.created_at,
        url: result.secure_url
      };
    } catch (error) {
      console.error('Image metadata error:', error);
      throw new Error('Failed to get image metadata');
    }
  }
}

module.exports = ImageService;