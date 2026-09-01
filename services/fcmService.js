const { adminMessaging, isFirebaseAdminInitialized } = require('../config/firebaseAdmin');
const logger = require('../config/logger');

/**
 * Send push notification to a specific device via FCM token
 */
async function sendToDevice(fcmToken, notification, data = {}) {
  if (!isFirebaseAdminInitialized() || !adminMessaging) {
    logger.warn('FCM send skipped: Firebase Admin is not initialized');
    return { success: false, reason: 'Firebase Admin not initialized' };
  }

  if (!fcmToken) {
    return { success: false, reason: 'No FCM token provided' };
  }

  const notificationPayload = {
    title: notification.title || 'VELORA Restaurant',
    body: notification.body || '',
  };
  if (notification.imageUrl) {
    notificationPayload.imageUrl = notification.imageUrl;
  }

  const message = {
    token: fcmToken,
    notification: notificationPayload,
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    ),
    webpush: {
      notification: {
        title: notification.title || 'VELORA Restaurant',
        body: notification.body || '',
        icon: notification.icon || '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
      },
      fcmOptions: {
        link: (data && data.url) || '/',
      },
    },
  };

  try {
    const response = await adminMessaging.send(message);
    logger.info(`FCM notification sent successfully: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    logger.error('Error sending FCM notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to all subscribers of a topic (e.g., 'admins', 'kitchen', 'orders')
 */
async function sendToTopic(topic, notification, data = {}) {
  if (!isFirebaseAdminInitialized() || !adminMessaging) {
    logger.warn('FCM topic send skipped: Firebase Admin is not initialized');
    return { success: false, reason: 'Firebase Admin not initialized' };
  }

  const notificationPayload = {
    title: notification.title || 'VELORA Restaurant',
    body: notification.body || '',
  };
  if (notification.imageUrl) {
    notificationPayload.imageUrl = notification.imageUrl;
  }

  const message = {
    topic,
    notification: notificationPayload,
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    ),
    webpush: {
      notification: {
        title: notification.title || 'VELORA Restaurant',
        body: notification.body || '',
        icon: notification.icon || '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
      },
      fcmOptions: {
        link: (data && data.url) || '/',
      },
    },
  };

  try {
    const response = await adminMessaging.send(message);
    logger.info(`FCM topic message sent to ${topic}: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    logger.error(`Error sending FCM topic message to ${topic}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification for a new or updated order
 */
async function sendOrderNotification(order, fcmToken = null, updateType = 'new_order') {
  const titles = {
    new_order: `🔔 New Order #${order.orderNumber || order._id?.toString().slice(-6)}!`,
    confirmed: `✅ Order Confirmed: #${order.orderNumber || order._id?.toString().slice(-6)}`,
    preparing: `👨‍🍳 Your order is being prepared!`,
    ready: `✨ Order Ready for pickup/serving!`,
    completed: `🎉 Order Completed! Enjoy your meal!`,
    cancelled: `❌ Order Cancelled: #${order.orderNumber || order._id?.toString().slice(-6)}`,
  };

  const notification = {
    title: titles[updateType] || `Order Update: #${order.orderNumber || ''}`,
    body: `Table ${order.tableNumber || 'N/A'} • Total: $${Number(order.totalAmount || 0).toFixed(2)}`,
    icon: '/icon.svg',
  };

  const data = {
    type: 'order_update',
    orderId: order._id ? order._id.toString() : String(order.id || ''),
    orderStatus: order.status || updateType,
    url: `/orders/${order._id || order.id}`,
  };

  if (fcmToken) {
    return sendToDevice(fcmToken, notification, data);
  } else {
    // Notify admins / staff topic
    return sendToTopic('admin_orders', notification, data);
  }
}

/**
 * Send push notification for a new live chat message
 */
async function sendChatNotification(message, fcmToken = null) {
  const notification = {
    title: `💬 Message from ${message.customerName || (message.tableNumber ? `Table ${message.tableNumber}` : 'Customer')}`,
    body: message.text || message.content || 'New chat message received.',
    icon: '/icon.svg',
  };

  const data = {
    type: 'chat_message',
    tableNumber: String(message.tableNumber || ''),
    url: `/admin/chat`,
  };

  if (fcmToken) {
    return sendToDevice(fcmToken, notification, data);
  } else {
    return sendToTopic('admin_chat', notification, data);
  }
}

module.exports = {
  sendToDevice,
  sendToTopic,
  sendOrderNotification,
  sendChatNotification,
};
