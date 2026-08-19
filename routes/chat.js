const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
// @route   GET /api/chat/active
// @desc    Get all active chat sessions
// @access  Private (Admin/Staff only)
router.get('/active', auth, admin, async (req, res) => {
  try {
    const sessions = await ChatSession.find({ status: 'open' }).sort({ updatedAt: -1 });
    res.json(sessions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/chat/:id
// @desc    Get chat session by ID
// @access  Private (Admin/Staff only)
router.get('/:id', auth, admin, async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Session not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/chat/:id/close
// @desc    Close a chat session
// @access  Private (Admin/Staff only)
router.put('/:id/close', auth, admin, async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    session.status = 'closed';
    await session.save();
    
    // Emit event to update clients
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.id).emit('chat_closed', { sessionId: session._id });
      io.emit('active_chats_updated'); // Tell admin dashboard to refresh list
    }

    res.json(session);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
