const admin = require('firebase-admin');

// Initialize Firebase Admin SDK with minimal configuration
if (!admin.apps.length) {
  try {
    // Initialize with basic project configuration
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'novatel-ai',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'novatel-ai.appspot.com'
    });
    
    console.log('Firebase Admin SDK initialized with basic configuration');
    console.log('Note: Server-side token verification is disabled - using client-side authentication');
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error.message);
    console.warn('Server will continue without Firebase Admin SDK');
  }
}

module.exports = admin;