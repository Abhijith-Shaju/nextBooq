const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const config = require('../config/env');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');
const { logAuditEvent } = require('../services/auditService');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: '7d' });
};

const registerUser = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !phone || !password || !name) {
      throw new BadRequestError('Name, email, phone, and password are required');
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      throw new BadRequestError('User with this email already exists');
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      throw new BadRequestError('User with this phone number already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email: email.toLowerCase(),
      phone,
      password_hash,
      staff_memberships: [],
    });

    await user.save();
    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'REGISTER',
      performedByUserId: user._id,
    });

    res.status(201).json({
      status: 'success',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    const user = await User.findOne({ email: email.toLowerCase() }).populate({
      path: 'staff_memberships.cafe_id',
      select: 'name slug timezone org_id',
    });
    if (!user) {
      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: null,
        action: 'LOGIN_FAILED',
        afterState: { attempted_email: email.toLowerCase(), ip: req.ip },
        performedByUserId: null,
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: user._id,
        action: 'LOGIN_FAILED',
        afterState: { ip: req.ip },
        performedByUserId: null,
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'LOGIN',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          staff_memberships: user.staff_memberships,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'staff_memberships.cafe_id',
      select: 'name slug timezone org_id',
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    res.status(200).json({
      status: 'success',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        staff_memberships: user.staff_memberships,
      },
    });
  } catch (error) {
    next(error);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

const customerQuickAuth = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !phone || !name || !password) {
      throw new BadRequestError('Name, email, phone, and password are required');
    }

    const cleanEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.findOne({ phone: phone.trim() });
    }

    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      user = new User({
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        password_hash,
        staff_memberships: [],
      });
      await user.save();
    } else {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        await logAuditEvent({
          cafeId: null,
          entityType: 'User',
          entityId: user._id,
          action: 'CUSTOMER_QUICK_AUTH_FAILED',
          afterState: { ip: req.ip },
          performedByUserId: null,
        });
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }

    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'CUSTOMER_QUICK_AUTH',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          staff_memberships: user.staff_memberships,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  customerQuickAuth,
};

