const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Check if Cloudinary credentials are present
const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let storage;
let cloudinary;

if (isCloudinaryConfigured) {
  console.log('☁️ Cloudinary configured for image storage');
  cloudinary = require('cloudinary').v2;

  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Configure Cloudinary storage
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'zaitoon-marketplace',
      allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 1200, height: 1200, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' },
      ]
    },
  });
} else {
  console.log('📂 Cloudinary NOT configured. Using local disk storage.');
  console.log('   Ensure server/uploads directory exists.');

  // Ensure uploads directory exists
  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configure Local Disk Storage
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Create unique filename: timestamp + random + extension
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'product-' + uniqueSuffix + ext);
    }
  });

  // Mock cloudinary object for helper functions to avoid crashes
  cloudinary = {
    uploader: {
      destroy: async () => ({ result: 'ok (local)' }),
      upload: async () => { throw new Error('Cannot upload to Cloudinary: not configured'); }
    },
    config: () => ({ cloud_name: 'local', api_key: false })
  };
}

// File filter
const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  }
});

// Middleware for single image upload
const uploadSingle = upload.single('image');

// Middleware for multiple image upload
const uploadMultiple = upload.array('images', 5);

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum 5MB allowed.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum 5 files allowed.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected field name for file upload.' });
    }
  }

  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({ error: 'Only image files are allowed.' });
  }

  console.error('Upload error:', error);
  return res.status(500).json({ error: 'File upload failed.' });
};

// Helper function to delete image from Cloudinary
// Helper function to delete image from Cloudinary or Local Storage
const deleteImage = async (publicId) => {
  try {
    if (!publicId) return;

    // Check if it's a Cloudinary ID (usually has folder prefix)
    if (!publicId.includes('.')) {
      // Cloudinary deletion
      if (isCloudinaryConfigured) {
        const result = await cloudinary.uploader.destroy(publicId);
        return result;
      }
    } else {
      // Local file deletion (publicId is filename with extension)
      const filePath = path.join(__dirname, '../../uploads', publicId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted local file: ${publicId}`);
        return { result: 'ok' };
      }
    }
    return { result: 'not found or ignored' };
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};

// Helper function to extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  try {
    // Cloudinary URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/filename.ext
    const urlParts = url.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');

    if (uploadIndex === -1) return null;

    // Get everything after 'upload/v1234567890/' or 'upload/'
    const pathAfterUpload = urlParts.slice(uploadIndex + 1);

    // Remove version if present (starts with 'v' followed by numbers)
    if (pathAfterUpload[0] && pathAfterUpload[0].match(/^v\d+$/)) {
      pathAfterUpload.shift();
    }

    // Join the remaining parts and remove file extension
    const publicIdWithExt = pathAfterUpload.join('/');
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ''); // Remove file extension

    return publicId;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  handleUploadError,
  deleteImage,
  getPublicIdFromUrl,
  cloudinary
};