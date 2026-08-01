const { PaymentRequiredError } = require('../utils/errors');

const enforceSubscriptionForWrite = (req, res, next) => {
  const cafe = req.cafe;
  if (!cafe) {
    return next();
  }

  const status = cafe.subscription_status;
  if (status === 'inactive' || status === 'past_due') {
    throw new PaymentRequiredError(
      `Action blocked: Cafe subscription is ${status}. Please update billing details.`
    );
  }

  next();
};

module.exports = {
  enforceSubscriptionForWrite,
};
