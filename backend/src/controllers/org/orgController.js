const Cafe = require('../../models/Cafe');
const Organization = require('../../models/Organization');
const Reservation = require('../../models/Reservation');
const User = require('../../models/User');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../utils/errors');

const NON_COUNTED_STATUSES = ['CANCELLED', 'EXPIRED'];
const ASSIGNABLE_ROLES = ['owner', 'manager', 'host', 'staff'];

// Owner gets [] because rbac.js short-circuits the owner role before ever
// checking `permissions` — kept here for consistency across roles.
const DEFAULT_PERMISSIONS_BY_ROLE = {
  owner: [],
  manager: ['edit_tables', 'edit_settings', 'view_reservations', 'edit_reservations', 'cancel_reservations'],
  host: ['view_reservations', 'edit_reservations', 'cancel_reservations'],
  staff: ['view_reservations'],
};

// req.ownerOrgId is set by requireOrgOwner, which has already verified the
// caller owns every cafe in this org — no further ownership check needed.
const getOrganization = async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.ownerOrgId).lean();
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    res.status(200).json({
      status: 'success',
      data: { id: organization._id.toString(), name: organization.name },
    });
  } catch (error) {
    next(error);
  }
};

const getCafes = async (req, res, next) => {
  try {
    const cafes = await Cafe.find({ org_id: req.ownerOrgId, is_deleted: false })
      .sort({ name: 1 })
      .lean();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const cafeIds = cafes.map((cafe) => cafe._id);
    const counts = await Reservation.aggregate([
      {
        $match: {
          cafe_id: { $in: cafeIds },
          start_time: { $gte: startOfDay, $lte: endOfDay },
          status: { $nin: NON_COUNTED_STATUSES },
        },
      },
      { $group: { _id: '$cafe_id', count: { $sum: 1 } } },
    ]);
    const countByCafeId = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));

    const data = cafes.map((cafe) => ({
      _id: cafe._id.toString(),
      name: cafe.name,
      slug: cafe.slug,
      subscription_status: cafe.subscription_status,
      today_reservation_count: countByCafeId.get(cafe._id.toString()) || 0,
    }));

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

const assertCafeInOwnedOrg = async (cafeId, ownerOrgId) => {
  const cafe = await Cafe.findOne({ _id: cafeId, is_deleted: false });
  if (!cafe || cafe.org_id.toString() !== ownerOrgId.toString()) {
    throw new ForbiddenError('Cafe does not belong to your organization');
  }
  return cafe;
};

const ROLE_RANK = { owner: 0, manager: 1, host: 2, staff: 3 };

const getCafeStaff = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const cafe = await assertCafeInOwnedOrg(cafeId, req.ownerOrgId);
    const resolvedCafeId = cafe._id.toString();

    const staffUsers = await User.find({ 'staff_memberships.cafe_id': resolvedCafeId })
      .select('name email staff_memberships')
      .lean();

    const data = staffUsers
      .map((user) => {
        const membership = user.staff_memberships.find(
          (m) => m.cafe_id.toString() === resolvedCafeId
        );
        return {
          user_id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: membership.role,
        };
      })
      .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name));

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

const postAssignStaff = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const { email, role } = req.body;

    if (typeof email !== 'string' || !email.trim()) {
      throw new BadRequestError('email is required');
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestError(`role must be one of ${ASSIGNABLE_ROLES.join(', ')}`);
    }

    const cafe = await assertCafeInOwnedOrg(cafeId, req.ownerOrgId);
    const resolvedCafeId = cafe._id.toString();

    const cleanEmail = email.trim().toLowerCase();
    const targetUser = await User.findOne({ email: cleanEmail });
    if (!targetUser) {
      throw new NotFoundError('No account found with that email');
    }

    if (targetUser._id.toString() === req.user._id.toString()) {
      throw new BadRequestError('You cannot change your own staff role or remove yourself from a cafe');
    }

    const existingMembership = targetUser.staff_memberships.find(
      (membership) => membership.cafe_id.toString() === resolvedCafeId
    );
    if (existingMembership) {
      existingMembership.role = role;
      existingMembership.permissions = DEFAULT_PERMISSIONS_BY_ROLE[role];
    } else {
      targetUser.staff_memberships.push({
        cafe_id: resolvedCafeId,
        role,
        permissions: DEFAULT_PERMISSIONS_BY_ROLE[role],
      });
    }
    await targetUser.save();

    res.status(200).json({
      status: 'success',
      data: {
        user_id: targetUser._id.toString(),
        email: targetUser.email,
        cafe_id: resolvedCafeId,
        role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    const { cafeId, userId } = req.params;

    const cafe = await assertCafeInOwnedOrg(cafeId, req.ownerOrgId);
    const resolvedCafeId = cafe._id.toString();

    if (userId === req.user._id.toString()) {
      throw new BadRequestError('You cannot change your own staff role or remove yourself from a cafe');
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    const beforeCount = targetUser.staff_memberships.length;
    targetUser.staff_memberships = targetUser.staff_memberships.filter(
      (membership) => membership.cafe_id.toString() !== resolvedCafeId
    );
    if (targetUser.staff_memberships.length === beforeCount) {
      throw new NotFoundError('User has no staff membership on this cafe');
    }
    await targetUser.save();

    res.status(200).json({
      status: 'success',
      data: { user_id: userId, cafe_id: cafeId },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOrganization, getCafes, getCafeStaff, postAssignStaff, deleteStaff };
