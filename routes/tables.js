const express = require('express');
const router = express.Router();
const Table = require('../models/Table');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Generate the base URL from env or fallback
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// @route   GET /api/tables
// @desc    Get all tables
// @access  Public (so guests can see if table is valid, or Admin only?)
// Let's make it so anyone can fetch basic table info, or maybe admin only for full list.
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find().sort({ tableNumber: 1 }).populate('currentOrderId');
    res.json(tables);
  } catch (err) {
    console.error('Error fetching tables:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET /api/tables/:id
// @desc    Get single table info (used by guest scanning QR)
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ msg: 'Table not found' });
    res.json(table);
  } catch (err) {
    console.error('Error fetching table:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/tables
// @desc    Add a new table (Admin)
// @access  Private/Admin
router.post('/', [auth, admin], async (req, res) => {
  try {
    const { tableNumber, capacity } = req.body;
    
    let table = await Table.findOne({ tableNumber });
    if (table) {
      return res.status(400).json({ msg: 'Table number already exists' });
    }

    table = new Table({
      tableNumber,
      capacity: capacity || 2,
    });

    // Save once to get the ID
    await table.save();

    // Now update with the qrCodeUrl
    table.qrCodeUrl = `${FRONTEND_URL}/table/${table._id}`;
    await table.save();

    res.status(201).json(table);
  } catch (err) {
    console.error('Error creating table:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   PUT /api/tables/:id
// @desc    Update table (Admin or System)
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { status, currentOrderId, capacity } = req.body;
    const table = await Table.findById(req.params.id);
    
    if (!table) return res.status(404).json({ msg: 'Table not found' });

    if (status) table.status = status;
    if (currentOrderId !== undefined) table.currentOrderId = currentOrderId;
    if (capacity) table.capacity = capacity;

    await table.save();
    
    // Broadcast table update
    const io = req.app.get('io');
    if (io) {
      io.emit('table_updated', table);
    }

    res.json(table);
  } catch (err) {
    console.error('Error updating table:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   DELETE /api/tables/:id
// @desc    Delete a table
// @access  Private/Admin
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const table = await Table.findByIdAndDelete(req.params.id);
    if (!table) return res.status(404).json({ msg: 'Table not found' });
    res.json({ msg: 'Table removed' });
  } catch (err) {
    console.error('Error deleting table:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/tables/:id/call-waiter
// @desc    Emit a waiter call event via Socket.IO
// @access  Public
router.post('/:id/call-waiter', async (req, res) => {
  try {
    const { requestType } = req.body; // e.g. "Water", "Bill", "Waiter"
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ msg: 'Table not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('waiter_called', {
        tableId: table._id,
        tableNumber: table.tableNumber,
        requestType: requestType || 'General',
        timestamp: new Date(),
      });
    }

    res.json({ msg: 'Waiter notified' });
  } catch (err) {
    console.error('Error calling waiter:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
