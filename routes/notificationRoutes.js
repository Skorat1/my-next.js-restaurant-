const express = require('express');
const router = express.Router();
const { sendToDevice, sendToTopic } = require('../services/fcmService');
const { adminMessaging, isFirebaseAdminInitialized } = require('../config/firebaseAdmin');
const User = require('../models/User');
const { optionalFirebaseAuth } = require('../middleware/firebaseAuth');

/**
 * Register or update an FCM device token for the current user
 * POST /api/notifications/fcm-token
 */
router.post('/fcm-token', optionalFirebaseAuth, async (req, res) => {
  try {
    const { token, role = 'customer' } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'FCM token is required' });
    }

    // If user is authenticated via MongoDB or Firebase Auth
    if (req.user && req.user.id) {
      await User.findByIdAndUpdate(req.user.id, {
        $addToSet: { fcmTokens: token },
      });
    }

    // Auto-subscribe to topics
    if (isFirebaseAdminInitialized() && adminMessaging) {
      try {
        if (role === 'admin' || role === 'manager' || (req.user && req.user.role === 'admin')) {
          await adminMessaging.subscribeToTopic([token], 'admin_orders');
          await adminMessaging.subscribeToTopic([token], 'admin_chat');
          await adminMessaging.subscribeToTopic([token], 'admins');
        } else {
          await adminMessaging.subscribeToTopic([token], 'customers');
        }
      } catch (topicErr) {
        console.warn('Warning: Could not subscribe token to FCM topic:', topicErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'FCM token registered and subscribed successfully',
    });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register FCM token',
      error: error.message,
    });
  }
});

/**
 * Send a test push notification
 * POST /api/notifications/test
 */
router.post('/test', async (req, res) => {
  try {
    const { token, topic, title = 'Velora Restaurant', body = 'This is a test notification from Firebase!' } = req.body;

    let result;
    if (token) {
      result = await sendToDevice(token, { title, body }, { url: '/' });
    } else if (topic) {
      result = await sendToTopic(topic, { title, body }, { url: '/' });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Provide either a token or a topic',
      });
    }

    return res.status(200).json({
      success: result.success,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message,
    });
  }
});

module.exports = router;
