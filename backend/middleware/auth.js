const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized — no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).populate('company').populate('branchId').populate('shiftId');
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized — invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'super_admin') return next();
  res.status(403).json({ success: false, message: 'Admin access required' });
};

const superAdminOnly = (req, res, next) => {
  if (req.user?.role === 'super_admin') return next();
  res.status(403).json({ success: false, message: 'Super Admin access required' });
};

module.exports = { protect, adminOnly, superAdminOnly };
