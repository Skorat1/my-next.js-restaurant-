const { adminAuth, isFirebaseAdminInitialized } = require('../config/firebaseAdmin');

/**
 * Middleware to authenticate requests using Firebase ID Tokens
 */
const verifyFirebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!isFirebaseAdminInitialized() || !adminAuth) {
      return res.status(503).json({
        success: false,
        message: 'Firebase Admin service is not configured on the server',
      });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decodedToken;
    req.user = {
      id: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email?.split('@')[0],
      role: decodedToken.role || 'customer',
      ...decodedToken,
    };

    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired Firebase authentication token',
      error: error.message,
    });
  }
};

/**
 * Optional Firebase Auth middleware (doesn't fail if no token provided)
 */
const optionalFirebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ') && isFirebaseAdminInitialized() && adminAuth) {
      const token = authHeader.split(' ')[1];
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.firebaseUser = decodedToken;
      req.user = {
        id: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email?.split('@')[0],
        role: decodedToken.role || 'customer',
        ...decodedToken,
      };
    }
  } catch (error) {
    // Continue without user
  }
  next();
};

module.exports = {
  verifyFirebaseAuth,
  optionalFirebaseAuth,
};
