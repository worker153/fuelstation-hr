/**
 * Seed the first Platform Admin user.
 *
 * Usage (from backend/ directory):
 *   node scripts/seedPlatformAdmin.js
 *
 * Reads credentials from environment variables so no plaintext password
 * lives in source code:
 *   PLATFORM_ADMIN_NAME     — full name (default: "Platform Admin")
 *   PLATFORM_ADMIN_EMAIL    — required
 *   PLATFORM_ADMIN_PASSWORD — required (min 8 chars recommended)
 *
 * Set them in your shell or create a one-time .env.seed file and run:
 *   source .env.seed && node scripts/seedPlatformAdmin.js
 *
 * The script is idempotent — it will not create a duplicate if the email
 * already exists; it will promote the existing user to platform admin instead.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');

(async () => {
  const {
    MONGO_URI,
    MONGODB_URI,
    PLATFORM_ADMIN_NAME     = 'Platform Admin',
    PLATFORM_ADMIN_EMAIL,
    PLATFORM_ADMIN_PASSWORD,
  } = process.env;

  const mongoUri = MONGO_URI || MONGODB_URI;

  // ── Validate env vars ────────────────────────────────────────────────────────
  const errors = [];
  if (!mongoUri)             errors.push('MONGO_URI or MONGODB_URI');
  if (!PLATFORM_ADMIN_EMAIL) errors.push('PLATFORM_ADMIN_EMAIL');
  if (errors.length) {
    console.error(`❌  Missing required environment variables: ${errors.join(', ')}`);
    process.exit(1);
  }

  // ── Connect ──────────────────────────────────────────────────────────────────
  await mongoose.connect(mongoUri);
  console.log('✅  MongoDB connected');

  const email = PLATFORM_ADMIN_EMAIL.toLowerCase().trim();

  // ── Check for existing user ───────────────────────────────────────────────────
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.isPlatformAdmin) {
      console.log(`ℹ️   ${existing.name} <${email}> is already a platform admin.`);
    } else {
      existing.isPlatformAdmin = true;
      existing.role            = 'platform_admin';
      existing.isActive        = true;
      existing.company         = undefined;
      await existing.save();
      console.log(`✅  Promoted ${existing.name} <${email}> to platform admin.`);
    }
  } else {
    if (!PLATFORM_ADMIN_PASSWORD) {
      console.error('❌  No existing user found for that email. PLATFORM_ADMIN_PASSWORD is required to create a new one.');
      await mongoose.disconnect();
      process.exit(1);
    }
    const admin = await User.create({
      name:            PLATFORM_ADMIN_NAME,
      email,
      password:        PLATFORM_ADMIN_PASSWORD,
      role:            'platform_admin',
      isPlatformAdmin: true,
      isActive:        true,
    });
    console.log(`✅  Platform admin created:`);
    console.log(`    Name  : ${admin.name}`);
    console.log(`    Email : ${admin.email}`);
    console.log(`    ID    : ${admin._id}`);
    console.log(`\n⚠️   Keep these credentials safe. The password is hashed in the DB.`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
