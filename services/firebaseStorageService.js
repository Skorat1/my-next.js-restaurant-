const { adminStorage, isFirebaseAdminInitialized } = require('../config/firebaseAdmin');
const logger = require('../config/logger');

/**
 * Upload a buffer or file to Firebase Storage
 * @param {Buffer} buffer File buffer
 * @param {string} destinationPath Destination path in bucket, e.g. 'dishes/dish-1.jpg'
 * @param {string} mimeType MIME content type
 * @returns {Promise<string>} Public download URL
 */
async function uploadToFirebaseStorage(buffer, destinationPath, mimeType = 'image/jpeg') {
  if (!isFirebaseAdminInitialized() || !adminStorage) {
    throw new Error('Firebase Admin is not initialized');
  }

  const bucket = adminStorage.bucket();
  const file = bucket.file(destinationPath);

  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    },
    public: true,
    validation: 'md5',
  });

  // Generate public URL
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
  logger.info(`File uploaded to Firebase Storage: ${publicUrl}`);
  return publicUrl;
}

/**
 * Delete a file from Firebase Storage
 * @param {string} filePath Path or filename in bucket
 */
async function deleteFromFirebaseStorage(filePath) {
  if (!isFirebaseAdminInitialized() || !adminStorage) {
    return false;
  }

  try {
    const bucket = adminStorage.bucket();
    // Strip public URL prefix if passed full URL
    const cleanPath = filePath.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
    await bucket.file(cleanPath).delete();
    logger.info(`File deleted from Firebase Storage: ${cleanPath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete file from Firebase Storage: ${filePath}`, error);
    return false;
  }
}

module.exports = {
  uploadToFirebaseStorage,
  deleteFromFirebaseStorage,
};
