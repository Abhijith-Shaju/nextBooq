class MongoTransactionTopologyError extends Error {
  constructor(message = 'MongoDB transaction support requires a replica set or sharded cluster') {
    super(message);
    this.name = 'MongoTransactionTopologyError';
    this.code = 'MONGO_TRANSACTIONS_UNSUPPORTED';
    this.statusCode = 503;
    this.isOperational = true;
  }
}

const getAdminDatabase = (connection) => {
  if (connection?.db && typeof connection.db.admin === 'function') {
    return connection.db.admin();
  }

  if (typeof connection?.admin === 'function') {
    return connection.admin();
  }

  throw new TypeError('A connected MongoDB database is required to inspect transaction support');
};

/**
 * Inspects the server that Mongoose is currently connected to. This detects
 * topology only; callers still need to use a session for every transactional
 * read and write.
 */
const inspectMongoTransactionSupport = async (connection) => {
  try {
    const hello = await getAdminDatabase(connection).command({ hello: 1 });

    if (hello?.setName) {
      return { supported: true, topology: 'replica-set' };
    }

    if (hello?.msg === 'isdbgrid') {
      return { supported: true, topology: 'sharded-cluster' };
    }

    return {
      supported: false,
      topology: 'standalone',
      reason: 'MongoDB did not report a replica-set or sharded-cluster topology.',
    };
  } catch (error) {
    return {
      supported: false,
      topology: 'unknown',
      reason: 'Unable to determine MongoDB transaction topology.',
    };
  }
};

const transactionTopologyMessage = (support) =>
  `MongoDB transactions require a replica set or sharded cluster (detected: ${support.topology}).`;

/**
 * Fail closed for operations that require atomic multi-document writes.
 * Future provisioning code must call this immediately before starting its
 * session; this guard is intentionally independent from navigation or HTTP.
 */
const assertMongoTransactionSupport = async (connection) => {
  const support = await inspectMongoTransactionSupport(connection);

  if (!support.supported) {
    throw new MongoTransactionTopologyError(transactionTopologyMessage(support));
  }

  return support;
};

/**
 * Enforces the deployment policy at startup. Production must have a
 * transaction-capable topology. Development remains usable for unrelated work,
 * but future provisioning requests must call assertMongoTransactionSupport and
 * return a controlled 503 before making any writes.
 */
const verifyMongoTransactionSupport = async (connection, { nodeEnv, logger = console } = {}) => {
  const support = await inspectMongoTransactionSupport(connection);

  if (support.supported) {
    return support;
  }

  const message = transactionTopologyMessage(support);
  if (nodeEnv === 'production') {
    throw new MongoTransactionTopologyError(message);
  }

  logger.warn(
    `[MONGODB TRANSACTIONS UNAVAILABLE] ${message} ` +
      'Cafe provisioning will remain unavailable until MongoDB is configured as a replica set or sharded cluster.'
  );
  return support;
};

module.exports = {
  MongoTransactionTopologyError,
  inspectMongoTransactionSupport,
  assertMongoTransactionSupport,
  verifyMongoTransactionSupport,
};
