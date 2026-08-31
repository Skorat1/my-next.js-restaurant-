const mongoose = require('mongoose');
require('dotenv').config();
const ChatSession = require('./models/ChatSession');
const ChatMessage = require('./models/ChatMessage');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB Connected successfully!');

  const sessionId = 'sess_live_demo_01';
  const text = 'Hello VELORA! I need a private table reservation.';
  const customerName = 'Aarav Mehta';

  const newMsg = await ChatMessage.create({
    sessionId,
    sender: 'customer',
    text,
    createdAt: new Date(),
  });
  console.log('Message created:', newMsg._id);

  const updatePayload = {
    lastMessage: text,
    status: 'active',
    updatedAt: new Date(),
    customerName,
  };

  const setOnInsertPayload = {
    sessionId,
    createdAt: new Date(),
  };

  const session = await ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $set: updatePayload,
      $setOnInsert: setOnInsertPayload,
    },
    { upsert: true, new: true }
  );

  console.log('Session upserted successfully in MongoDB:', session);
  process.exit(0);
}

test().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
