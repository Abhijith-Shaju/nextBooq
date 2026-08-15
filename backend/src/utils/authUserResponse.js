const ACTIVE_STAFF_MEMBERSHIP_POPULATE = {
  path: 'staff_memberships.cafe_id',
  select: 'name slug timezone org_id',
  match: { is_deleted: false },
};

const buildAuthUserPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  is_platform_admin: Boolean(user.is_platform_admin),
  staff_memberships: Array.isArray(user.staff_memberships)
    ? user.staff_memberships.filter((membership) => membership?.cafe_id)
    : [],
});

module.exports = {
  ACTIVE_STAFF_MEMBERSHIP_POPULATE,
  buildAuthUserPayload,
};
