// Recursively strip HTML tags from strings to prevent XSS
function sanitize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/<[^>]*>/g, '')       // strip HTML tags
      .replace(/javascript:/gi, '')  // strip js: URIs
      .trim();
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const key of Object.keys(value)) {
      clean[key] = sanitize(value[key]);
    }
    return clean;
  }
  return value;
}

module.exports = function sanitizeInput(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitize(req.body);
    }
  } catch (err) {
    // Prevent unhandled exceptions from breaking request pipeline
  }
  next();
};
