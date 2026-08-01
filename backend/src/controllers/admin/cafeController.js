const Cafe = require('../../models/Cafe');
const Organization = require('../../models/Organization');
const User = require('../../models/User');
const { BadRequestError } = require('../../utils/errors');

const createCafe = async (req, res, next) => {
  try {
    const { org_name, cafe_name, slug, timezone, reservation_rules } = req.body;

    if (!org_name || !cafe_name || !slug) {
      throw new BadRequestError('org_name, cafe_name, and slug are required');
    }

    const existingSlug = await Cafe.findOne({ slug: slug.toLowerCase() });
    if (existingSlug) {
      throw new BadRequestError(`Cafe slug '${slug}' is already taken`);
    }

    const org = new Organization({ name: org_name });
    await org.save();

    const cafe = new Cafe({
      org_id: org._id,
      name: cafe_name,
      slug: slug.toLowerCase(),
      timezone: timezone || 'UTC',
      reservation_rules: reservation_rules || {},
      subscription_status: 'active',
    });
    await cafe.save();

    // Assign owner role to requesting user for this cafe
    if (req.user) {
      await User.updateOne(
        { _id: req.user._id },
        {
          $push: {
            staff_memberships: {
              cafe_id: cafe._id,
              role: 'owner',
              permissions: [
                'manage_staff',
                'edit_tables',
                'edit_settings',
                'view_reservations',
                'edit_reservations',
                'cancel_reservations',
                'manage_billing',
              ],
            },
          },
        }
      );
    }

    res.status(201).json({
      status: 'success',
      data: {
        organization: org,
        cafe: cafe,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getCafeBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cafe = await Cafe.findOne({ slug: slug.toLowerCase(), is_deleted: false });
    if (!cafe) {
      throw new BadRequestError('Cafe not found');
    }

    res.status(200).json({
      status: 'success',
      data: cafe,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCafe,
  getCafeBySlug,
};
