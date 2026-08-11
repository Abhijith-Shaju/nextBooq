const Subscription = require('../models/Subscription');
const Cafe = require('../models/Cafe');

/**
 * Flips is_current, active Subscriptions whose current_period_end has
 * passed to past_due, syncing Cafe.subscription_status. Purely a clock
 * check — no payment verification happens here. The platform admin records
 * a renewal (subscriptionAdminService.recordSubscriptionTerm) once payment
 * is confirmed, which supersedes the lapsed record and clears past_due.
 * Only status: 'active' is eligible — a subscription the admin has already
 * set to 'inactive' (a deliberate disable, not a billing lapse) or 'trial'
 * is left alone; this sweep should never override an explicit admin choice.
 */
const expireLapsedSubscriptions = async () => {
  const lapsed = await Subscription.find({
    is_current: true,
    status: 'active',
    current_period_end: { $lte: new Date() },
  });

  let expiredCount = 0;
  for (const subscription of lapsed) {
    subscription.status = 'past_due';
    await subscription.save();
    await Cafe.updateOne(
      { _id: subscription.cafe_id },
      { $set: { subscription_status: 'past_due' } }
    );
    expiredCount += 1;
  }

  return { expiredCount };
};

module.exports = {
  expireLapsedSubscriptions,
};
