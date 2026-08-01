const Cafe = require('../models/Cafe');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const mongoose = require('mongoose');

const extractTenant = async (req, res, next) => {
  try {
    let cafeId = req.params.cafeId || req.headers['x-tenant-id'] || req.query.cafeId;
    const slug = req.params.slug || req.query.slug;

    let cafe = null;

    if (cafeId) {
      if (!mongoose.Types.ObjectId.isValid(cafeId)) {
        throw new BadRequestError(`Invalid cafe ID format: ${cafeId}`);
      }
      cafe = await Cafe.findOne({ _id: cafeId, is_deleted: false });
    } else if (slug) {
      cafe = await Cafe.findOne({ slug: slug.toLowerCase(), is_deleted: false });
    }

    if (!cafe) {
      throw new NotFoundError('Cafe tenant not found or inactive');
    }

    req.tenantId = cafe._id;
    req.cafe = cafe;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  extractTenant,
};
