// Mock WhatsApp Integration Module
// In a production environment, this would use Twilio API or WhatsApp Business API

const sendWhatsAppMessage = async (phone, message) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  console.log(`\n========================================`);
  console.log(`📱 WHATSAPP MESSAGE SENT TO: ${phone}`);
  console.log(`========================================`);
  console.log(message);
  console.log(`========================================\n`);

  // We could also log this to a CRM database model here.
  return true;
};

const sendBookingConfirmation = async (phone, name, date, time, guests) => {
  const message = `Hello ${name}! 👋\n\nYour table for ${guests} at VELORA is confirmed for ${date} at ${time}. \n\nWe look forward to serving you!\n📍 View Menu: https://velora.com/menu`;
  return sendWhatsAppMessage(phone, message);
};

const sendFeedbackRequest = async (phone, name, orderId) => {
  const message = `Hi ${name}, thank you for dining with VELORA today!\n\nHow was your experience? Reply with 1 to 5 stars ⭐, or click here to leave a review: https://velora.com/feedback/${orderId}`;
  return sendWhatsAppMessage(phone, message);
};

const sendPromotionalCampaign = async (phone, name, promoContent) => {
  const message = `Exclusive for you, ${name}! 🌟\n\n${promoContent}\n\nBook your table now: https://restaurant-psi-henna-35.vercel.app`;
  return sendWhatsAppMessage(phone, message);
};

module.exports = {
  sendWhatsAppMessage,
  sendBookingConfirmation,
  sendFeedbackRequest,
  sendPromotionalCampaign
};
