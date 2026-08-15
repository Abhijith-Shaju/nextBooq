const mongoose = require('mongoose');
const config = require('./env');
const { verifyMongoTransactionSupport } = require('./mongoTransactionSupport');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    await verifyMongoTransactionSupport(conn.connection, {
      nodeEnv: config.NODE_ENV,
      logger: console,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
    throw error;
  }
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  console.log('🔌 MongoDB Disconnected');
};

module.exports = {
  connectDB,
  disconnectDB,
};
