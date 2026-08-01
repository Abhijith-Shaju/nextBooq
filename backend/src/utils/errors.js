class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401);
  }
}

class PaymentRequiredError extends AppError {
  constructor(message = 'Payment required. Subscription inactive or past due.') {
    super(message, 402);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Permission denied') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict or concurrent write mismatch') {
    super(message, 409);
  }
}

class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable Entity - Business rule violation') {
    super(message, 422);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  PaymentRequiredError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
};
