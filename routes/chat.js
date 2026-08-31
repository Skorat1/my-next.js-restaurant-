const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// ── 1. Create or Join Chat Session (Public / Customer)
router.post('/session', async (req, res) => {
  try {
    const { sessionId, customerName } = req.body;
    if (!sessionId || !customerName) {
      return res.status(400).json({ success: false, msg: 'sessionId and customerName are required' });
    }

    let session = await ChatSession.findById(sessionId);
    if (!session) {
      session = new ChatSession({
        _id: sessionId,
        customerName: customerName.trim(),
        status: 'open',
        messages: [
          {
            sender: 'admin',
            text: `Welcome ${customerName.trim()} to VELORA Concierge! How may our team assist you today?`,
            timestamp: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await session.save();

      const wsHelpers = req.app.get('wsHelpers');
      if (wsHelpers) {
        wsHelpers.emitGlobally('active_chats_updated');
      }
    }

    res.json({ success: true, session });
  } catch (err) {
    console.error('Error creating/joining chat session:', err);
    res.status(500).json({ success: false, msg: 'Server error while starting chat session' });
  }
});

// ── 2. Get Single Chat Session by ID (Public for customer polling)
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, msg: 'Chat session not found' });
    }
    res.json({
      success: true,
      _id: session._id,
      customerName: session.customerName,
      status: session.status,
      messages: session.messages || [],
      updatedAt: session.updatedAt,
    });
  } catch (err) {
    console.error('Error getting chat session:', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// ── 3. Send Message (Public & Admin - Saves directly to MongoDB)
router.post('/message', async (req, res) => {
  try {
    const { sessionId, sender, text, customerName } = req.body;

    if (!sessionId || !sender || !text || !text.trim()) {
      return res.status(400).json({ success: false, msg: 'sessionId, sender, and text are required' });
    }

    let session = await ChatSession.findById(sessionId);
    if (!session) {
      session = new ChatSession({
        _id: sessionId,
        customerName: customerName || 'Guest',
        status: 'open',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const newMessage = {
      sender: sender === 'admin' ? 'admin' : 'customer',
      text: text.trim(),
      timestamp: new Date(),
    };

    session.messages.push(newMessage);
    session.updatedAt = new Date();
    if (session.status === 'closed' && sender === 'customer') {
      session.status = 'open'; // Reopen if customer replies
    }

    await session.save();

    // Broadcast in real-time via WebSocket if available
    const wsHelpers = req.app.get('wsHelpers');
    if (wsHelpers) {
      wsHelpers.emitToRoom(sessionId, 'support_message', newMessage);
      wsHelpers.emitGlobally('active_chats_updated');
    }

    res.json({
      success: true,
      message: newMessage,
      session,
    });
  } catch (err) {
    console.error('Error sending chat message:', err);
    res.status(500).json({ success: false, msg: 'Server error while sending message' });
  }
});

// ── 4. Get Active Chat Sessions (Admin/Staff only)
router.get('/active', [auth, admin], async (req, res) => {
  try {
    const sessions = await ChatSession.find({ status: 'open' }).sort({ updatedAt: -1 });
    res.json(sessions);
  } catch (err) {
    console.error('Error fetching active chat sessions:', err);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

// ── 5. Get All Chat Sessions (Admin/Staff only)
router.get('/all', [auth, admin], async (req, res) => {
  try {
    const sessions = await ChatSession.find().sort({ updatedAt: -1 }).limit(100);
    res.json(sessions);
  } catch (err) {
    console.error('Error fetching all chat sessions:', err);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

// ── 6. Get Chat Session Details by ID (Admin/Staff only)
router.get('/:id', [auth, admin], async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, msg: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    console.error('Error fetching session:', err);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

// ── 7. Close Chat Session (Admin/Staff only)
router.put('/:id/close', [auth, admin], async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, msg: 'Session not found' });
    }
    session.status = 'closed';
    session.updatedAt = new Date();
    await session.save();

    const wsHelpers = req.app.get('wsHelpers');
    if (wsHelpers) {
      wsHelpers.emitToRoom(req.params.id, 'chat_closed', { sessionId: session._id });
      wsHelpers.emitGlobally('active_chats_updated');
    }

    res.json({ success: true, session });
  } catch (err) {
    console.error('Error closing session:', err);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

module.exports = router;
