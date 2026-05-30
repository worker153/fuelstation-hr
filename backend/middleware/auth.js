const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── protect — verifies JWT and attaches req.user ─────────────────────────────
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
    const query   = User.findById(decoded.id).populate('branchId').populate('shiftId');
    // Populate company only for non-platform users
    req.user = await query.populate('company');
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }
    if (!req.user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact your administrator.' });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized — invalid or expired token' });
  }
};

// ── adminOnly — company admin or higher ──────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.isPlatformAdmin) return next();
  if (['admin', 'super_admin'].includes(req.user?.role)) return next();
  res.status(403).json({ success: false, message: 'Admin access required' });
};

// ── superAdminOnly — company super_admin or platform admin ───────────────────
const superAdminOnly = (req, res, next) => {
  if (req.user?.isPlatformAdmin) return next();
  if (req.user?.role === 'super_admin') return next();
  res.status(403).json({ success: false, message: 'Super Admin access required' });
};

// ── platformAdminOnly — platform staff only ──────────────────────────────────
const platformAdminOnly = (req, res, next) => {
  if (req.user?.isPlatformAdmin || req.user?.role === 'platform_admin') return next();
  res.status(403).json({ success: false, message: 'Platform Admin access required' });
};

module.exports = { protect, adminOnly, superAdminOnly, platformAdminOnly };
