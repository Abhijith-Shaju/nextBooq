const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('User authentication required'));
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      return next(new ForbiddenError('Tenant scope context missing'));
    }

    // Find staff membership matching current cafe
    const membership = req.user.staff_memberships.find(
      (m) => m.cafe_id.toString() === tenantId.toString()
    );

    if (!membership) {
      return next(new ForbiddenError('Access denied: No staff membership for this cafe'));
    }

    // Owner role automatically inherits all permissions
    if (membership.role === 'owner') {
      return next();
    }

    if (!membership.permissions || !membership.permissions.includes(requiredPermission)) {
      return next(
        new ForbiddenError(
          `Permission denied: Requires '${requiredPermission}' permission for this cafe`
        )
      );
    }

    next();
  };
};

module.exports = {
  requirePermission,
};
