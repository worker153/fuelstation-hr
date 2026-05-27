const jwt     = require('jsonwebtoken');
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
  company:     { id: company._id, name: company.name }
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

module.exports = { register, login, getMe };
