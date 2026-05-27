/**
 * Permission middleware — checks fine-grained per-user permissions.
 * super_admin / admin always pass every check.
 */

// Require a specific named permission
const requirePermission = (perm) => (req, res, next) => {
  const u = req.user;
  if (['super_admin', 'admin'].includes(u.role)) return next();
  if (!u.isActive) {
    return res.status(403).json({ success: false, message: 'Your account has been deactivated' });
  }
  if (u.permissions?.[perm]) return next();
  return res.status(403).json({
    success: false,
    message: `Access denied — requires "${perm}" permission`
  });
};

// Super Admin only routes
const superAdminOnly = (req, res, next) => {
  if (['super_admin', 'admin'].includes(req.user.role)) return next();
  return res.status(403).json({
    success: false,
    message: 'Super Admin access required'
  });
};

// Check account is active
const requireActive = (req, res, next) => {
  if (!req.user.isActive) {
    return res.status(403).json({ success: false, message: 'Your account has been deactivated' });
  }
  next();
};

module.exports = { requirePermission, superAdminOnly, requireActive };
