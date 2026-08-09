/**
 * Strips MongoDB operator keys ("$..." ) and dotted keys from req.body/query/params
 * so client input can never reshape a Mongoose query filter (e.g. { phone: { $ne: null } }).
 * This is defense-in-depth: individual controllers should still validate/coerce field
 * types themselves, but this closes the hole for any that don't.
 */
const stripOperatorKeys = (value) => {
  if (Array.isArray(value)) {
    value.forEach(stripOperatorKeys);
    return;
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        stripOperatorKeys(value[key]);
      }
    }
  }
};

const sanitizeInput = (req, res, next) => {
  stripOperatorKeys(req.body);
  stripOperatorKeys(req.query);
  stripOperatorKeys(req.params);
  next();
};

module.exports = sanitizeInput;
