const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config/env');
const Organization = require('../src/models/Organization');
const Cafe = require('../src/models/Cafe');
const Table = require('../src/models/Table');
const User = require('../src/models/User');

const seedData = async () => {
  try {
    console.log('🌱 Connecting to MongoDB for seeding...');
    await mongoose.connect(config.MONGO_URI);

    // Create default Organization
    let org = await Organization.findOne({ name: 'Thetys Hospitality' });
    if (!org) {
      org = await Organization.create({ name: 'Thetys Hospitality' });
      console.log(`✅ Created Organization: ${org.name}`);
    }

    // Create default Cafe (slug: thetys-system)
    const slug = 'thetys-system';
    let cafe = await Cafe.findOne({ slug });
    if (!cafe) {
      cafe = await Cafe.create({
        org_id: org._id,
        name: 'Thetys System Cafe',
        slug,
        timezone: 'Asia/Kolkata',
        subscription_status: 'active',
        reservation_rules: {
          default_turn_time_minutes: 90,
          max_party_size: 12,
          booking_lead_time_hours: 24,
          hold_duration_minutes: 10,
        },
      });
      console.log(`✅ Created Cafe: ${cafe.name} (${cafe.slug}) [ID: ${cafe._id}]`);
    } else {
      console.log(`ℹ️ Cafe with slug '${slug}' already exists: ${cafe._id}`);
    }

    // Create sample tables if none exist for this cafe
    const existingTablesCount = await Table.countDocuments({ cafe_id: cafe._id, is_deleted: false });
    if (existingTablesCount === 0) {
      await Table.insertMany([
        { cafe_id: cafe._id, table_number: 'T-01', capacity: 2, status: 'active' },
        { cafe_id: cafe._id, table_number: 'T-02', capacity: 4, status: 'active' },
        { cafe_id: cafe._id, table_number: 'T-03', capacity: 4, status: 'active' },
        { cafe_id: cafe._id, table_number: 'T-04', capacity: 6, status: 'active' },
      ]);
      console.log('✅ Created initial tables (T-01, T-02, T-03, T-04)');
    }

    // Ensure staff membership is present for this cafe
    const permissions = [
      'manage_staff',
      'edit_tables',
      'edit_settings',
      'view_reservations',
      'edit_reservations',
      'cancel_reservations',
      'manage_billing',
    ];

    const staffMembership = {
      cafe_id: cafe._id,
      role: 'owner',
      permissions,
    };

    // Create default staff user if not exists
    const defaultEmail = 'staff@nextbooq.com';
    let staffUser = await User.findOne({ email: defaultEmail });
    if (!staffUser) {
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash('Password123!', salt);
      staffUser = await User.create({
        name: 'Staff Operator',
        email: defaultEmail,
        phone: '+19999999999',
        password_hash,
        staff_memberships: [staffMembership],
      });
      console.log(`✅ Created default user: ${defaultEmail} (Password: Password123!)`);
    }

    // Grant staff membership for this cafe to ALL existing users in MongoDB for smooth local dev testing
    const users = await User.find({});
    for (const u of users) {
      const hasMembership = u.staff_memberships.some(
        (m) => m.cafe_id.toString() === cafe._id.toString()
      );
      if (!hasMembership) {
        u.staff_memberships.push(staffMembership);
        await u.save();
        console.log(`✅ Granted owner staff membership for '${cafe.slug}' to user: ${u.email}`);
      }
    }

    console.log('\n🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
