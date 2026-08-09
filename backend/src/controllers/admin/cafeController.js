const Cafe = require('../../models/Cafe');
const Organization = require('../../models/Organization');
const User = require('../../models/User');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

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

const POSITIVE_INT_RULES = ['default_turn_time_minutes', 'max_party_size', 'hold_duration_minutes'];
const NON_NEGATIVE_INT_RULES = ['booking_lead_time_hours'];

const updateCafe = async (req, res, next) => {
  try {
    const cafeId = req.tenantId;
    const { reservation_rules } = req.body;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      throw new NotFoundError('Cafe not found');
    }

    if (reservation_rules && typeof reservation_rules === 'object') {
      for (const field of POSITIVE_INT_RULES) {
        if (reservation_rules[field] === undefined) continue;
        const value = reservation_rules[field];
        if (!Number.isInteger(value) || value <= 0) {
          throw new BadRequestError(`reservation_rules.${field} must be a positive integer`);
        }
      }
      for (const field of NON_NEGATIVE_INT_RULES) {
        if (reservation_rules[field] === undefined) continue;
        const value = reservation_rules[field];
        if (!Number.isInteger(value) || value < 0) {
          throw new BadRequestError(`reservation_rules.${field} must be a non-negative integer`);
        }
      }

      cafe.reservation_rules = {
        ...cafe.reservation_rules.toObject(),
        ...reservation_rules,
      };
    }

    await cafe.save();

    res.status(200).json({
      status: 'success',
      data: cafe,
    });
  } catch (error) {
    next(error);
  }
};

const getCafeBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const lowerSlug = slug.toLowerCase();

    // Ignore static asset requests matching dynamic slug route
    if (['favicon.ico', 'sw.js', 'robots.txt', 'site.webmanifest'].includes(lowerSlug)) {
      return res.status(404).json({ status: 'fail', message: 'Resource not found' });
    }

    const cafe = await Cafe.findOne({ slug: lowerSlug, is_deleted: false });
    if (!cafe) {
      throw new NotFoundError('Cafe not found');
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
  updateCafe,
  getCafeBySlug,
};
