const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const Company = require('../models/Company');
const User    = require('../models/User');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });

const formatUser = (user, company) => ({
  id:          user._id,
  name:        user.name,
  email:       user.email,
  role:        user.role,
  permissions: user.permissions || {},
  isActive:    user.isActive,
  company:     { id: company._id, name: company.name },
  branchId:    user.branchId  ? String(user.branchId._id  || user.branchId)  : null,
  shiftId:     user.shiftId   ? String(user.shiftId._id   || user.shiftId)   : null,
});

// POST /api/auth/register  — creates company + Super Admin
const register = async (req, res) => {
  const { companyName, companyEmail, companyPhone, adminName, adminEmail, password } = req.body;

  if (!companyName || !companyEmail || !adminName || !adminEmail || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }
  if (await Company.findOne({ email: companyEmail })) {
    return res.status(400).json({ success: false, message: 'Company email already registered' });
  }
  if (await User.findOne({ email: adminEmail })) {
    return res.status(400).json({ success: false, message: 'Admin email already registered' });
  }

  const company = await Company.create({ name: companyName, email: companyEmail, phone: companyPhone });
  const user    = await User.create({
    company:  company._id,
    name:     adminName,
    email:    adminEmail,
    password,
    role:     'super_admin',  // First user of a company is always Super Admin
    isActive: true
  });

  res.status(201).json({
    success: true,
    token:   generateToken(user._id),
    user:    formatUser(user, company)
  });
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await User.findOne({ email }).select('+password').populate('company');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact your administrator.' });
  }

  res.json({
    success: true,
    token:   generateToken(user._id),
    user:    formatUser(user, user.company)
  });
};

// GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: formatUser(req.user, req.user.company) });
};

// GET /api/auth/admin-hint/:userId  — public, returns name+company for PIN login screen
const getAdminHint = async (req, res) => {
  const user = await User.findById(req.params.userId)
    .select('name role company pin isActive')
    .populate('company', 'name');
  if (!user || !user.isActive)
    return res.status(404).json({ success: false, message: 'User not found' });
  res.json({
    success: true,
    data: {
      name:        user.name,
      role:        user.role,
      companyName: user.company?.name || '',
      hasPin:      !!user.pin,
    }
  });
};

// POST /api/auth/pin-login  — verify PIN and return JWT
const pinLogin = async (req, res) => {
  const { userId, pin } = req.body;
  if (!userId || !pin)
    return res.status(400).json({ success: false, message: 'userId and pin required' });

  const user = await User.findById(userId).select('+pin').populate('company');
  if (!user || !user.isActive)
    return res.status(401).json({ success: false, message: 'User not found' });
  if (!user.pin)
    return res.status(401).json({ success: false, message: 'PIN not set — contact your admin' });

  const match = await bcrypt.compare(String(pin), user.pin);
  if (!match)
    return res.status(401).json({ success: false, message: 'Wrong PIN' });

  res.json({
    success: true,
    token:   generateToken(user._id),
    user:    formatUser(user, user.company),
  });
};

// PUT /api/auth/pin  — set own PIN (must be logged in normally)
const setPin = async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4,6}$/.test(String(pin)))
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' });
  const hashed = await bcrypt.hash(String(pin), 10);
  await User.findByIdAndUpdate(req.user._id, { pin: hashed, pinUpdatedAt: new Date() });
  res.json({ success: true, message: 'PIN saved' });
};

// PUT /api/auth/pin/:userId  — super-admin sets PIN for another staff member
const setUserPin = async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4,6}$/.test(String(pin)))
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' });

  const target = await User.findOne({ _id: req.params.userId, company: req.user.company._id });
  if (!target) return res.status(404).json({ success: false, message: 'User not found' });

  const hashed = await bcrypt.hash(String(pin), 10);
  await User.findByIdAndUpdate(target._id, { pin: hashed, pinUpdatedAt: new Date() });
  res.json({ success: true, message: `PIN set for ${target.name}` });
};

module.exports = { register, login, getMe, getAdminHint, pinLogin, setPin, setUserPin };
