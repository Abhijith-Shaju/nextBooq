const Subscription = require('../models/Subscription');
const Cafe = require('../models/Cafe');
const mongoose = require('mongoose');

/**
 * Flips is_current, active Subscriptions whose current_period_end has
 * passed to past_due, syncing Cafe.subscription_status. Purely a clock
 * check — no payment verification happens here. The platform admin records
 * a renewal (subscriptionAdminService.recordSubscriptionTerm) once payment
 * is confirmed, which supersedes the lapsed record and clears past_due.
 * Only status: 'active' is eligible — a subscription the admin has already
 * set to 'inactive' is left alone; this sweep should never override an
 * explicit admin choice. Lapsed trials expire to inactive rather than
 * past_due, because a trial does not create a payment obligation.
 */
const expireLapsedSubscriptions = async () => {
  const now = new Date();
  const lapsed = await Subscription.find({
    is_current: true,
    status: { $in: ['active', 'trial'] },
    current_period_end: { $lte: now },
  });

  let expiredCount = 0;
  for (const subscription of lapsed) {
    const expiredStatus = subscription.status === 'trial' ? 'inactive' : 'past_due';

    const committedTransition = await mongoose.connection.transaction(async (session) => {
      // The scan above is intentionally only a candidate list. Recheck every
      // mutable field inside the transaction so a renewal that superseded this
      // record cannot be expired or overwrite the cafe's newer status.
      const result = await Subscription.updateOne(
        {
          _id: subscription._id,
          is_current: true,
          status: subscription.status,
          current_period_end: { $lte: now },
        },
        { $set: { status: expiredStatus } },
        { session }
      );
      if (result.modifiedCount !== 1) return false;

      await Cafe.updateOne(
        { _id: subscription.cafe_id },
        { $set: { subscription_status: expiredStatus } },
        { session }
      );
      return true;
    });

    if (committedTransition) expiredCount += 1;
  }

  return { expiredCount };
};

module.exports = {
  expireLapsedSubscriptions,
};
