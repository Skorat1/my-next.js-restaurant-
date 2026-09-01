const admin = require('firebase-admin');
const logger = require('./logger');

let isFirebaseAdminInitialized = false;

try {
  // Option 1: Initializing using Environment Variables (recommended for cloud hosts / Heroku / Vercel / Railway)
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    const formattedPrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedPrivateKey,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
    });
    isFirebaseAdminInitialized = true;
    logger.info('Firebase Admin SDK initialized successfully via environment credentials.');
  }
  // Option 2: Initializing using Google Application Default Credentials or service-account.json
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    isFirebaseAdminInitialized = true;
    logger.info('Firebase Admin SDK initialized via GOOGLE_APPLICATION_CREDENTIALS.');
  } else {
    logger.warn('Firebase Admin credentials not found in environment variables. Firebase Admin features will be inactive until configured.');
  }
} catch (error) {
  logger.error('Failed to initialize Firebase Admin SDK:', error);
}

const adminAuth = isFirebaseAdminInitialized ? admin.auth() : null;
const adminFirestore = isFirebaseAdminInitialized ? admin.firestore() : null;
const adminStorage = isFirebaseAdminInitialized ? admin.storage() : null;
const adminMessaging = isFirebaseAdminInitialized ? admin.messaging() : null;

module.exports = {
  admin,
  adminAuth,
  adminFirestore,
  adminStorage,
  adminMessaging,
  isFirebaseAdminInitialized: () => isFirebaseAdminInitialized,
};
