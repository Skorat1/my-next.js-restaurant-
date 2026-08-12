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
  if (req.body) req.body = sanitize(req.body);

  // Express 5: req.query is getter-only, mutate properties in-place
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      req.query[key] = sanitize(req.query[key]);
    }
  }

  if (req.params) {
    for (const key of Object.keys(req.params)) {
      req.params[key] = sanitize(req.params[key]);
    }
  }

  next();
};
