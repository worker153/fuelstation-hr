/**
 * Platform Admin Controller
 *
 * Handles all cross-company operations that only a platform admin can perform:
 *   - List / search all companies
 *   - Approve or reject new registrations
 *   - Activate subscription (trial or paid)
 *   - Suspend / unsuspend a company
 *   - Extend trial or subscription
 *   - Platform-wide stats
 *   - Manage platform admin users
 */

const Company = require('../models/Company');
const User    = require('../models/User');
const bcrypt  = require('bcryptjs');

// ── GET /api/platform/companies ───────────────────────────────────────────────
// Query: ?status=pending_approval&search=sage&page=1&limit=20
const listCompanies = async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status)  filter.subscriptionStatus = status;
  if (search)  filter.$or = [
    { name:        { $regex: search, $options: 'i' } },
    { companyCode: { $regex: search, $options: 'i' } },
    { email:       { $regex: search, $options: 'i' } },
  ];

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Company.countDocuments(filter);
  const companies = await Company.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean({ virtuals: true });

  // Attach user count per company
  const ids      = companies.map(c => c._id);
  const counts   = await User.aggregate([
    { $match: { company: { $in: ids } } },
    { $group: { _id: '$company', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
  const result   = companies.map(c => ({ ...c, userCount: countMap[String(c._id)] || 0 }));

  res.json({ success: true, total, page: Number(page), data: result });
};

// ── GET /api/platform/companies/:id ──────────────────────────────────────────
const getCompany = async (req, res) => {
  const company = await Company.findById(req.params.id).lean({ virtuals: true });
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  const users = await User.find({ company: company._id })
    .select('name email role isActive createdAt')
    .lean();

  res.json({ success: true, data: { ...company, users } });
};

// ── POST /api/platform/companies/:id/approve ─────────────────────────────────
// Body: { trialDays? }   — default 30 days trial
const approveCompany = async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
  if (company.approvalStatus === 'approved') {
    return res.status(400).json({ success: false, message: 'Already approved' });
  }

  const trialDays = Number(req.body.trialDays) || 30;
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

  company.approvalStatus     = 'approved';
  company.approvedAt         = new Date();
  company.approvedBy         = req.user._id;
  company.subscriptionStatus = 'trial';
  company.plan               = 'trial';
  company.trialEndsAt        = trialEndsAt;
  await company.save();

  res.json({
    success: true,
    message: `${company.name} approved. Trial ends ${trialEndsAt.toDateString()}.`,
    data: company,
  });
};

// ── POST /api/platform/companies/:id/reject ───────────────────────────────────
// Body: { reason }
const rejectCompany = async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason required' });

  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  company.approvalStatus     = 'rejected';
  company.rejectedAt         = new Date();
  company.rejectedReason     = reason;
  company.subscriptionStatus = 'suspended';
  await company.save();

  res.json({ success: true, message: `${company.name} rejected.`, data: company });
};

// ── POST /api/platform/companies/:id/activate ────────────────────────────────
// Body: { plan, months? }   — moves from trial/expired to active
const activateSubscription = async (req, res) => {
  const { plan = 'starter', months = 1 } = req.body;
  const validPlans = ['starter', 'professional', 'enterprise'];
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ success: false, message: `plan must be one of: ${validPlans.join(', ')}` });
  }

  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  const subscriptionEndsAt = new Date();
  subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + Number(months));

  company.subscriptionStatus = 'active';
  company.plan               = plan;
  company.subscriptionEndsAt = subscriptionEndsAt;
  company.trialEndsAt        = undefined;  // clear trial date
  await company.save();

  res.json({
    success: true,
    message: `${company.name} activated on ${plan} plan until ${subscriptionEndsAt.toDateString()}.`,
    data: company,
  });
};

// ── POST /api/platform/companies/:id/suspend ─────────────────────────────────
// Body: { reason }
const suspendCompany = async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ success: false, message: 'Suspension reason required' });

  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  company.subscriptionStatus = 'suspended';
  company.suspendedAt        = new Date();
  company.suspendedReason    = reason;
  await company.save();

  res.json({ success: true, message: `${company.name} suspended.`, data: company });
};

// ── POST /api/platform/companies/:id/unsuspend ───────────────────────────────
const unsuspendCompany = async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
  if (company.subscriptionStatus !== 'suspended') {
    return res.status(400).json({ success: false, message: 'Company is not suspended' });
  }

  // Restore to active if they have a valid subscriptionEndsAt, else trial
  const now = new Date();
  if (company.subscriptionEndsAt && company.subscriptionEndsAt > now) {
    company.subscriptionStatus = 'active';
  } else if (company.trialEndsAt && company.trialEndsAt > now) {
    company.subscriptionStatus = 'trial';
  } else {
    company.subscriptionStatus = 'expired';
  }
  company.suspendedAt     = undefined;
  company.suspendedReason = undefined;
  await company.save();

  res.json({ success: true, message: `${company.name} unsuspended.`, data: company });
};

// ── POST /api/platform/companies/:id/extend ──────────────────────────────────
// Body: { days }  — extend trial OR active subscription
const extendSubscription = async (req, res) => {
  const { days } = req.body;
  if (!days || Number(days) < 1) {
    return res.status(400).json({ success: false, message: 'days must be a positive number' });
  }

  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  const d = Number(days);
  if (company.subscriptionStatus === 'trial' || company.subscriptionStatus === 'expired' && company.plan === 'trial') {
    const base = (company.trialEndsAt && company.trialEndsAt > new Date())
      ? company.trialEndsAt
      : new Date();
    base.setDate(base.getDate() + d);
    company.trialEndsAt        = base;
    company.subscriptionStatus = 'trial';
  } else {
    const base = (company.subscriptionEndsAt && company.subscriptionEndsAt > new Date())
      ? company.subscriptionEndsAt
      : new Date();
    base.setDate(base.getDate() + d);
    company.subscriptionEndsAt = base;
    company.subscriptionStatus = 'active';
  }
  await company.save();

  res.json({ success: true, message: `${company.name} extended by ${d} days.`, data: company });
};

// ── PUT /api/platform/companies/:id/notes ────────────────────────────────────
const updateNotes = async (req, res) => {
  const { notes } = req.body;
  const company = await Company.findByIdAndUpdate(
    req.params.id,
    { notes },
    { new: true }
  );
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
  res.json({ success: true, data: company });
};

// ── GET /api/platform/stats ───────────────────────────────────────────────────
const getPlatformStats = async (req, res) => {
  const [
    totalCompanies,
    byStatus,
    totalUsers,
    recentSignups,
  ] = await Promise.all([
    Company.countDocuments(),
    Company.aggregate([
      { $group: { _id: '$subscriptionStatus', count: { $sum: 1 } } }
    ]),
    User.countDocuments({ isPlatformAdmin: { $ne: true } }),
    Company.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name companyCode subscriptionStatus plan createdAt')
      .lean(),
  ]);

  const statusMap = Object.fromEntries(byStatus.map(s => [s._id, s.count]));

  res.json({
    success: true,
    data: {
      totalCompanies,
      byStatus:  statusMap,
      totalUsers,
      recentSignups,
    }
  });
};

// ── GET /api/platform/admins ──────────────────────────────────────────────────
const listPlatformAdmins = async (req, res) => {
  const admins = await User.find({ isPlatformAdmin: true })
    .select('name email role isActive createdAt')
    .lean();
  res.json({ success: true, data: admins });
};

// ── POST /api/platform/admins ─────────────────────────────────────────────────
// Body: { name, email, password }
const createPlatformAdmin = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email, and password are required' });
  }
  if (await User.findOne({ email: email.toLowerCase() })) {
    return res.status(400).json({ success: false, message: 'Email already in use' });
  }

  const admin = await User.create({
    name,
    email,
    password,
    role:            'platform_admin',
    isPlatformAdmin: true,
    isActive:        true,
  });

  res.status(201).json({
    success: true,
    data: { id: admin._id, name: admin.name, email: admin.email },
  });
};

// ── DELETE /api/platform/admins/:id ──────────────────────────────────────────
const removePlatformAdmin = async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    return res.status(400).json({ success: false, message: 'Cannot remove yourself' });
  }
  const admin = await User.findOneAndDelete({ _id: req.params.id, isPlatformAdmin: true });
  if (!admin) return res.status(404).json({ success: false, message: 'Platform admin not found' });
  res.json({ success: true, message: `${admin.name} removed` });
};

module.exports = {
  listCompanies,
  getCompany,
  approveCompany,
  rejectCompany,
  activateSubscription,
  suspendCompany,
  unsuspendCompany,
  extendSubscription,
  updateNotes,
  getPlatformStats,
  listPlatformAdmins,
  createPlatformAdmin,
  removePlatformAdmin,
};
