const { ForbiddenError } = require('../utils/errors');

/**
 * Gates the /api/v1/platform-admin/* namespace. Must run after `authenticate`
 * — it only checks a flag on req.user, it does not verify identity itself.
 */
const requirePlatformAdmin = (req, res, next) => {
  if (!req.user?.is_platform_admin) {
    return next(new ForbiddenError('Platform admin access required'));
  }
  next();
};

module.exports = {
  requirePlatformAdmin,
};
