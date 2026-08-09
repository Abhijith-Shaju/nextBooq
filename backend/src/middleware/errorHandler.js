const { AppError } = require('../utils/errors');
const config = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log error details appropriately by status code
  if (error.statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  } else {
    console.warn(`[WARN] ${req.method} ${req.originalUrl}: ${error.statusCode} - ${err.message}`);
  }

  // Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }

  // Mongoose Duplicate Key (11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    error = new AppError(`Duplicate value for field '${field}'. Please use another value.`, 409);
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message).join(', ');
    error = new AppError(`Validation Failure: ${message}`, 400);
  }

  // Zod Validation Error
  if (err.name === 'ZodError') {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    error = new AppError(`Invalid request payload: ${message}`, 400);
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid authentication token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Authentication token has expired', 401);
  }

  const message = error.message || 'Internal Server Error';

  res.status(error.statusCode).json({
    status: error.status || 'error',
    statusCode: error.statusCode,
    message,
    // Nested to match the frontend's ApiResponse.error contract
    // (frontend/src/lib/types/api-responses.d.ts) — the top-level `message`
    // above is kept for any caller still reading it directly.
    error: {
      code: err.name || 'ERROR',
      message,
    },
    ...(config.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
