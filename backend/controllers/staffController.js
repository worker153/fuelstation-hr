const User    = require('../models/User');
const Company = require('../models/Company');

// Default permissions per role
const ROLE_DEFAULTS = {
  verification_officer: {
    verifyWorkers: true, uploadDocuments: true, manageGuarantors: true,
    editWorkers: false, approveWorkers: false, manageBranches: false,
    manageStaff: false, viewWorkers: true, addWorkers: false
  },
  supervisor: {
    verifyWorkers: false, uploadDocuments: false, manageGuarantors: false,
    editWorkers: false, approveWorkers: false, manageBranches: false,
    manageStaff: false, viewWorkers: true, addWorkers: false,
    submitShortages: true
  },
  record_supervisor: {
    verifyWorkers: true, uploadDocuments: true, manageGuarantors: true,
    editWorkers: true, approveWorkers: false, manageBranches: true,
    manageStaff: false, viewWorkers: true, addWorkers: true
  },
  hr_staff: {
    verifyWorkers: false, uploadDocuments: true, manageGuarantors: false,
    editWorkers: false, approveWorkers: false, manageBranches: false,
    manageStaff: false, viewWorkers: true, addWorkers: true
  }
};

// GET /api/staff
const getStaff = async (req, res) => {
  const staff = await User.find({ company: req.user.company._id })
    .select('-password')
    .populate('createdBy', 'name')
    .populate('branchId',  'name')
    .populate('shiftId',   'name startTime endTime')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: staff });
};

// GET /api/staff/role-defaults/:role
const getRoleDefaults = (req, res) => {
  const defaults = ROLE_DEFAULTS[req.params.role];
  if (!defaults) return res.status(404).json({ success: false, message: 'Unknown role' });
  res.json({ success: true, data: defaults });
};

// POST /api/staff
const createStaff = async (req, res) => {
  const { name, email, password, role, permissions } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, email, password and role are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  if (await User.findOne({ email: email.toLowerCase() })) {
    return res.status(400).json({ success: false, message: 'Email already in use' });
  }
  // Cannot create another super_admin
  const safeRole = role === 'super_admin' ? 'hr_staff' : role;
  const perms    = permissions || ROLE_DEFAULTS[safeRole] || {};

  const { branchId, shiftId } = req.body;
  const user = await User.create({
    company:     req.user.company._id,
    name, email,
    password,
    role:        safeRole,
    permissions: perms,
    branchId:    branchId || undefined,
    shiftId:     shiftId  || undefined,
    isActive:    true,
    createdBy:   req.user._id
  });

  const doc = user.toObject();
  delete doc.password;
  res.status(201).json({ success: true, data: doc });
};

// PUT /api/staff/:id
const updateStaff = async (req, res) => {
  const staff = await User.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
  if (staff.role === 'super_admin' && !staff._id.equals(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Cannot modify another Super Admin' });
  }

  const { name, role, permissions, isActive, branchId, shiftId } = req.body;
  if (name) staff.name = name;
  if (role && role !== 'super_admin') staff.role = role;
  if (branchId !== undefined) staff.branchId = branchId || undefined;
  if (shiftId  !== undefined) staff.shiftId  = shiftId  || undefined;
  if (permissions) {
    const existing = staff.permissions?.toObject ? staff.permissions.toObject() : (staff.permissions || {});
    staff.permissions = { ...existing, ...permissions };
  }
  if (typeof isActive === 'boolean') {
    // Can't deactivate yourself
    if (staff._id.equals(req.user._id) && !isActive) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }
    staff.isActive = isActive;
  }
  await staff.save();
  const doc = staff.toObject();
  delete doc.password;
  res.json({ success: true, data: doc });
};

// DELETE /api/staff/:id
const deleteStaff = async (req, res) => {
  const staff = await User.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
  if (staff.role === 'super_admin') {
    return res.status(403).json({ success: false, message: 'Cannot delete the Super Admin' });
  }
  if (staff._id.equals(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Cannot delete your own account' });
  }
  await staff.deleteOne();
  res.json({ success: true, message: 'Staff member removed' });
};

// PUT /api/staff/:id/reset-password
const resetPassword = async (req, res) => {
  const staff = await User.findOne({ _id: req.params.id, company: req.user.company._id }).select('+password');
  if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  staff.password = password;
  await staff.save();
  res.json({ success: true, message: 'Password reset successfully' });
};

// GET /api/staff/custom-roles — list company-defined custom roles
const getCustomRoles = async (req, res) => {
  const company = await Company.findById(req.user.company._id).select('staffRoles').lean();
  res.json({ success: true, data: company?.staffRoles || [] });
};

// POST /api/staff/custom-roles — add a new custom role
// body: { label } e.g. "Pump Supervisor"
const addCustomRole = async (req, res) => {
  const { label } = req.body;
  if (!label || !label.trim()) {
    return res.status(400).json({ success: false, message: 'Role label is required' });
  }
  // Generate a slug from the label
  const value = label.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const company = await Company.findById(req.user.company._id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  // Check for duplicate
  const exists = company.staffRoles?.find(r => r.value === value || r.label.toLowerCase() === label.trim().toLowerCase());
  if (exists) return res.status(400).json({ success: false, message: 'A role with that name already exists' });

  company.staffRoles = company.staffRoles || [];
  company.staffRoles.push({ value, label: label.trim() });
  await company.save();

  res.status(201).json({ success: true, data: { value, label: label.trim() } });
};

// DELETE /api/staff/custom-roles/:value — remove a custom role by its slug
const deleteCustomRole = async (req, res) => {
  const { value } = req.params;
  const company = await Company.findById(req.user.company._id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  const before = company.staffRoles?.length || 0;
  company.staffRoles = (company.staffRoles || []).filter(r => r.value !== value);
  if (company.staffRoles.length === before) {
    return res.status(404).json({ success: false, message: 'Role not found' });
  }
  await company.save();
  res.json({ success: true, message: 'Role deleted' });
};

module.exports = {
  getStaff, getRoleDefaults, createStaff, updateStaff, deleteStaff, resetPassword,
  getCustomRoles, addCustomRole, deleteCustomRole,
  ROLE_DEFAULTS,
};
