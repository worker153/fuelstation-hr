const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const Company = require('../models/Company');
const User    = require('../models/User');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });

// ── Format user for API response ──────────────────────────────────────────────
const formatUser = (user, company) => {
  const base = {
    id:             user._id,
    name:           user.name,
    email:          user.email,
    role:           user.role,
    permissions:    user.permissions || {},
    isActive:       user.isActive,
    isPlatformAdmin: user.isPlatformAdmin || false,
    branchId:  user.branchId ? String(user.branchId._id  || user.branchId)  : null,
    shiftId:   user.shiftId  ? String(user.shiftId._id   || user.shiftId)   : null,
  };
  if (company) {
    base.company = {
      id:                 company._id,
      name:               company.name,
      companyCode:        company.companyCode,
      subscriptionStatus: company.subscriptionStatus || 'active',
      plan:               company.plan               || 'trial',
      trialEndsAt:        company.trialEndsAt        || null,
      trialDaysLeft:      company.trialDaysLeft      ?? null,
    };
  }
  return base;
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Creates a new company (pending_approval) + its first super_admin user.
// Company goes live only after platform admin approves it.
const register = async (req, res) => {
  const {
    companyName, companyEmail, companyPhone,
    adminName,   adminEmail,   password,
    industry,    country,
  } = req.body;

  if (!companyName || !companyEmail || !adminName || !adminEmail || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }
  if (await Company.findOne({ email: companyEmail.toLowerCase() })) {
    return res.status(400).json({ success: false, message: 'Company email already registered' });
  }
  if (await User.findOne({ email: adminEmail.toLowerCase() })) {
    return res.status(400).json({ success: false, message: 'Admin email already registered' });
  }

  // Generate unique company code
  const companyCode = await Company.generateUniqueCode(companyName);

  const company = await Company.create({
    name:              companyName,
    email:             companyEmail,
    phone:             companyPhone,
    industry:          industry || '',
    country:           country  || 'Nigeria',
    companyCode,
    subscriptionStatus: 'pending_approval',
    approvalStatus:     'pending',
    registeredBy:      adminName,
  });

  const user = await User.create({
    company:  company._id,
    name:     adminName,
    email:    adminEmail,
    password,
    role:     'super_admin',
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful. Awaiting platform approval before you can log in.',
    companyCode,
    token:  generateToken(user._id),
    user:   formatUser(user, company),
  });
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Supports two flows:
//   1. New:  { companyCode, email, password }  → finds user scoped to that company
//   2. Legacy / platform admin: { email, password }  → finds user by email globally
const login = async (req, res) => {
  const { email, password, companyCode } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  let user;

  if (companyCode) {
    // ── New multi-company flow ───────────────────────────────────────────────
    const company = await Company.findOne({
      companyCode: companyCode.trim().toUpperCase()
    });
    if (!company) {
      return res.status(401).json({ success: false, message: 'Invalid company code' });
    }

    // Check subscription before even authenticating
    const access = company.isAccessAllowed();
    if (!access.allowed) {
      // Auto-expire trial if needed
      if (access.code === 'TRIAL_EXPIRED') {
        await Company.findByIdAndUpdate(company._id, { subscriptionStatus: 'expired' });
      }
      return res.status(402).json({ success: false, code: access.code, message: access.message });
    }

    user = await User.findOne({ email: email.toLowerCase(), company: company._id })
      .select('+password')
      .populate('company')
      .populate('branchId')
      .populate('shiftId');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } else {
    // ── Legacy / platform admin flow ─────────────────────────────────────────
    user = await User.findOne({ email: email.toLowerCase() })
      .select('+password')
      .populate('company')
      .populate('branchId')
      .populate('shiftId');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Non-platform users must provide company code going forward
    // (allow existing users through for backward compat)
    if (!user.isPlatformAdmin && user.company) {
      const access = user.company.isAccessAllowed();
      if (!access.allowed) {
        if (access.code === 'TRIAL_EXPIRED') {
          await Company.findByIdAndUpdate(user.company._id, { subscriptionStatus: 'expired' });
        }
        return res.status(402).json({ success: false, code: access.code, message: access.message });
      }
    }
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account deactivated. Contact your administrator.' });
  }

  res.json({
    success: true,
    token:   generateToken(user._id),
    user:    formatUser(user, user.company),
  });
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  res.json({ success: true, user: formatUser(req.user, req.user.company) });
};

// ── GET /api/auth/admin-hint/:userId ─────────────────────────────────────────
// Public — returns name + company for PIN login screen
const getAdminHint = async (req, res) => {
  const user = await User.findById(req.params.userId)
    .select('name role company pin isActive')
    .populate('company', 'name companyCode subscriptionStatus');
  if (!user || !user.isActive)
    return res.status(404).json({ success: false, message: 'User not found' });
  res.json({
    success: true,
    data: {
      name:        user.name,
      role:        user.role,
      companyName: user.company?.name || '',
      companyCode: user.company?.companyCode || '',
      hasPin:      !!user.pin,
    }
  });
};

// ── POST /api/auth/pin-login ──────────────────────────────────────────────────
const pinLogin = async (req, res) => {
  const { userId, pin } = req.body;
  if (!userId || !pin)
    return res.status(400).json({ success: false, message: 'userId and pin required' });

  const user = await User.findById(userId).select('+pin').populate('company');
  if (!user || !user.isActive)
    return res.status(401).json({ success: false, message: 'User not found' });
  if (!user.pin)
    return res.status(401).json({ success: false, message: 'PIN not set — contact your admin' });

  // Check subscription
  if (user.company) {
    const access = user.company.isAccessAllowed();
    if (!access.allowed) {
      return res.status(402).json({ success: false, code: access.code, message: access.message });
    }
  }

  const match = await bcrypt.compare(String(pin), user.pin);
  if (!match)
    return res.status(401).json({ success: false, message: 'Wrong PIN' });

  res.json({
    success: true,
    token:   generateToken(user._id),
    user:    formatUser(user, user.company),
  });
};

// ── PUT /api/auth/pin ─────────────────────────────────────────────────────────
const setPin = async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4,6}$/.test(String(pin)))
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' });
  const hashed = await bcrypt.hash(String(pin), 10);
  await User.findByIdAndUpdate(req.user._id, { pin: hashed, pinUpdatedAt: new Date() });
  res.json({ success: true, message: 'PIN saved' });
};

// ── PUT /api/auth/pin/:userId ─────────────────────────────────────────────────
const setUserPin = async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4,6}$/.test(String(pin)))
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' });

  const target = await User.findOne({
    _id:     req.params.userId,
    company: req.user.company._id,
  });
  if (!target) return res.status(404).json({ success: false, message: 'User not found' });

  const hashed = await bcrypt.hash(String(pin), 10);
  await User.findByIdAndUpdate(target._id, { pin: hashed, pinUpdatedAt: new Date() });
  res.json({ success: true, message: `PIN set for ${target.name}` });
};

module.exports = { register, login, getMe, getAdminHint, pinLogin, setPin, setUserPin };
