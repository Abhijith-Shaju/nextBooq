const {
  createApplication,
  withdrawApplication,
  getLatestApplicationSummary,
} = require('../services/cafeApplicationService');

const postCafeApplication = async (req, res, next) => {
  try {
    const application = await createApplication({ user: req.user, body: req.body });
    res.status(201).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

const getMyCafeApplication = async (req, res, next) => {
  try {
    const application = await getLatestApplicationSummary(req.user._id);
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

const deleteMyCafeApplication = async (req, res, next) => {
  try {
    const application = await withdrawApplication(req.user._id);
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

module.exports = { postCafeApplication, getMyCafeApplication, deleteMyCafeApplication };
