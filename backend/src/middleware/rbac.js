const { ForbiddenError, UnauthorizedError } = require('../utils/errors');
const { findStaffMembership } = require('../utils/staffMembership');

// `requiredPermission` may be a permission string, or a function of the
// request that returns one — needed when the permission depends on the
// request body, e.g. cancelling a reservation requires 'cancel_reservations'
// while other status transitions require 'edit_reservations' (see
// protectedRoutes.js).
const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('User authentication required'));
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      return next(new ForbiddenError('Tenant scope context missing'));
    }

    const membership = findStaffMembership(req.user, tenantId);

    if (!membership) {
      return next(new ForbiddenError('Access denied: No staff membership for this cafe'));
    }

    // Owner role automatically inherits all permissions
    if (membership.role === 'owner') {
      return next();
    }

    const permission =
      typeof requiredPermission === 'function' ? requiredPermission(req) : requiredPermission;

    if (!membership.permissions || !membership.permissions.includes(permission)) {
      return next(
        new ForbiddenError(`Permission denied: Requires '${permission}' permission for this cafe`)
      );
    }

    next();
  };
};

module.exports = {
  requirePermission,
};
