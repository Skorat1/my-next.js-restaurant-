const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary if environment variables are present
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Upload local file or buffer to cloud storage or return local fallback URL
 * @param {string} filePath - Absolute path of file stored locally
 * @param {string} folder - Destination folder name (e.g. 'menu', 'uploads')
 * @returns {Promise<string>} Public URL or filename
 */
async function uploadToCloud(filePath, folder = 'restaurant-portal') {
  if (!isCloudinaryConfigured) {
    // Return relative path or filename for local static serving
    return path.basename(filePath);
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });
    // Clean up local temp file after cloud upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return result.secure_url;
  } catch (error) {
    console.error('❌ Cloudinary upload failed, using local file:', error.message);
    return path.basename(filePath);
  }
}

module.exports = {
  isCloudinaryConfigured,
  uploadToCloud,
};
