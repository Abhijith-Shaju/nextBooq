const { sendContactEmail } = require('../../services/emailService');
const { BadRequestError } = require('../../utils/errors');

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitContactForm = async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestError('Name is required');
    }
    if (name.trim().length > 200) {
      throw new BadRequestError('Name must be 200 characters or fewer');
    }

    if (typeof email !== 'string' || !EMAIL_FORMAT_REGEX.test(email.trim())) {
      throw new BadRequestError('A valid email address is required');
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestError('Message is required');
    }
    if (message.trim().length > 5000) {
      throw new BadRequestError('Message must be 5000 characters or fewer');
    }

    await sendContactEmail({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
    });

    res.status(200).json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};

module.exports = { submitContactForm };
