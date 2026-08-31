const app = require('../server');

module.exports = (req, res) => {
  try {
    return app(req, res);
  } catch (err) {
    console.error('Unhandled Lambda Error in api/index.js:', err);
    return res.status(500).json({
      error: 'Lambda Execution Error',
      message: err.message,
      stack: err.stack,
    });
  }
};
