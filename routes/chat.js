const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');

// ── 1. Fetch Sessions for Admin (GET /api/chat/sessions or /api/chat/active)
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await ChatSession.find({}).sort({ updatedAt: -1 });
    res.json({ success: true, data: sessions });
  } catch (err) {
    console.error('Error fetching chat sessions:', err);
    res.status(500).json({ success: false, msg: 'Server error fetching chat sessions' });
  }
});

router.get('/active', async (req, res) => {
  try {
    const sessions = await ChatSession.find({ status: 'active' }).sort({ updatedAt: -1 });
    res.json({ success: true, data: sessions });
  } catch (err) {
    console.error('Error fetching active chat sessions:', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// ── 2. Send/Store Message (POST /api/chat/message)
router.post('/message', async (req, res) => {
  try {
    const { sessionId, sender, text, customerName } = req.body;

    if (!sessionId || !sender || !text || !text.trim()) {
      return res.status(400).json({
        success: false,
        msg: 'sessionId, sender, and text are required',
      });
    }

    const trimmedText = text.trim();

    // 1. Create message in ChatMessage collection
    const newMsg = await ChatMessage.create({
      sessionId,
      sender: sender === 'admin' ? 'admin' : 'customer',
      text: trimmedText,
      createdAt: new Date(),
    });

    // 2. Upsert ChatSession with latest message & activity
    const updatePayload = {
      lastMessage: trimmedText,
      status: 'active',
      updatedAt: new Date(),
    };

    const setOnInsertPayload = {
      sessionId,
      createdAt: new Date(),
    };

    if (customerName && customerName.trim()) {
      updatePayload.customerName = customerName.trim();
    } else {
      setOnInsertPayload.customerName = 'Guest Customer';
    }

    const updatedSession = await ChatSession.findOneAndUpdate(
      { sessionId },
      { 
        $set: updatePayload,
        $setOnInsert: setOnInsertPayload
      },
      { upsert: true, new: true }
    );

    // 3. Real-time broadcast if WebSocket is active
    const wsHelpers = req.app.get('wsHelpers');
    if (wsHelpers) {
      wsHelpers.emitToRoom(sessionId, 'support_message', newMsg);
      wsHelpers.emitGlobally('active_chats_updated', { sessionId, message: newMsg });
    }

    return res.json({
      success: true,
      message: newMsg,
      session: updatedSession,
    });
  } catch (err) {
    console.error('Error storing chat message:', err);
    return res.status(500).json({ success: false, msg: 'Server error while storing message', error: err.message, stack: err.stack });
  }
});

// ── 3. Fetch Chat History for a Session (GET /api/chat/history?sessionId=xyz or GET /api/chat/history/:sessionId)
router.get('/history', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.query.id;
    if (!sessionId) {
      return res.status(400).json({ success: false, msg: 'sessionId query parameter is required' });
    }

    const messages = await ChatMessage.find({ sessionId }).sort({ createdAt: 1 });
    return res.json({ success: true, data: messages });
  } catch (err) {
    console.error('Error fetching chat history:', err);
    return res.status(500).json({ success: false, msg: 'Server error fetching history' });
  }
});

router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await ChatMessage.find({ sessionId }).sort({ createdAt: 1 });
    return res.json({ success: true, data: messages });
  } catch (err) {
    console.error('Error fetching chat history:', err);
    return res.status(500).json({ success: false, msg: 'Server error fetching history' });
  }
});

// ── 4. Close a Chat Session (PUT /api/chat/:id/close)
router.put('/:id/close', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = await ChatSession.findOneAndUpdate(
      { sessionId },
      { status: 'closed', updatedAt: new Date() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, msg: 'Chat session not found' });
    }

    const wsHelpers = req.app.get('wsHelpers');
    if (wsHelpers) {
      wsHelpers.emitToRoom(sessionId, 'chat_closed', { sessionId });
      wsHelpers.emitGlobally('active_chats_updated', { sessionId, status: 'closed' });
    }

    return res.json({ success: true, session });
  } catch (err) {
    console.error('Error closing chat session:', err);
    return res.status(500).json({ success: false, msg: 'Server error closing session' });
  }
});

// Legacy backward-compatibility endpoints
router.get('/all', async (req, res) => {
  try {
    const sessions = await ChatSession.find({}).sort({ updatedAt: -1 });
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const session = await ChatSession.findOne({ sessionId: req.params.id });
    if (!session) {
      return res.status(404).json({ success: false, msg: 'Session not found' });
    }
    const messages = await ChatMessage.find({ sessionId: req.params.id }).sort({ createdAt: 1 });
    res.json({ success: true, session, messages });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

module.exports = router;
