const mongoose = require('mongoose');
const config = require('../src/config/env');
const User = require('../src/models/User');

/**
 * Grants (or revokes) platform-admin access for a user by email. This is
 * deliberately the ONLY way to set User.is_platform_admin — there is no API
 * endpoint or UI that can set it, since it grants cross-tenant access to
 * every organization's data.
 *
 * Usage:
 *   node scripts/grantPlatformAdmin.js user@example.com
 *   node scripts/grantPlatformAdmin.js user@example.com --revoke
 */
const run = async () => {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: node scripts/grantPlatformAdmin.js <email> [--revoke]');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.MONGO_URI);

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.error(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    user.is_platform_admin = !revoke;
    await user.save();

    console.log(
      `✅ ${revoke ? 'Revoked' : 'Granted'} platform-admin access for ${user.email} (${user._id})`
    );
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to update platform-admin access:', error);
    process.exit(1);
  }
};

run();
