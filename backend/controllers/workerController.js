const Worker    = require('../models/Worker');
const Guarantor = require('../models/Guarantor');
const Branch    = require('../models/Branch');
const Shift     = require('../models/Shift');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

const VALID_DOC_TYPES = ['nin', 'voter_card', 'drivers_license', 'national_id', 'international_passport'];

// ─── Auto-calculate verification status ──────────────────────────────────────
// Only updates status if it's in the "working" range (not yet submitted/approved/rejected)
const LOCKED_STATUSES = ['pending_approval', 'verified', 'rejected'];

const recalcStatus = async (workerId) => {
  const worker = await Worker.findById(workerId);
  if (!worker) return;
  if (LOCKED_STATUSES.includes(worker.verificationStatus)) return; // don't change once submitted

  const guarantorCount = await Guarantor.countDocuments({ worker: workerId });
  const checks = [
    !!worker.passportPhoto?.url,
    !!worker.signature?.url,
    !!(worker.addressLocation?.coordinates?.lat || worker.address),
    (worker.verificationDocuments?.length || 0) > 0,
    guarantorCount >= 1,
    guarantorCount >= 2,
    (worker.houseVerification?.photos?.length || 0) > 0
  ];
  const score = checks.filter(Boolean).length;

  const status = score === 0      ? 'pending_verification'
               : score < checks.length ? 'partially_verified'
               : 'partially_verified';   // fully done but not yet submitted

  if (worker.verificationStatus !== status) {
    await Worker.findByIdAndUpdate(workerId, { verificationStatus: status });
  }
};

// ─── GET /api/workers/stats ──────────────────────────────────────────────────
const getStats = async (req, res) => {
  const cid = req.user.company._id;

  // Branch/shift-scoped for non-admin users
  const isAdmin = req.user.role === 'super_admin' || req.user.can('manageBranches');
  const base = { company: cid };
  if (!isAdmin) {
    if (req.user.branchId) base.branchId = req.user.branchId;
    if (req.user.can('viewOwnShift') && req.user.shiftId) base.shiftId = req.user.shiftId;
  }

  const [total, verified, pendingApproval, partial, pending, guarantorWorkers] = await Promise.all([
    Worker.countDocuments(base),
    Worker.countDocuments({ ...base, verificationStatus: { $in: ['fully_verified', 'verified'] } }),
    Worker.countDocuments({ ...base, verificationStatus: 'pending_approval' }),
    Worker.countDocuments({ ...base, verificationStatus: 'partially_verified' }),
    Worker.countDocuments({ ...base, verificationStatus: { $in: ['pending', 'pending_verification'] } }),
    Guarantor.aggregate([
      { $match: { company: cid } },
      { $group: { _id: '$worker' } },
      { $count: 'total' }
    ])
  ]);
  res.json({
    success: true,
    data: { total, verified, pendingApproval, partial, pending, withGuarantors: guarantorWorkers[0]?.total || 0 }
  });
};

// ─── GET /api/workers ────────────────────────────────────────────────────────
const getWorkers = async (req, res) => {
  const { page = 1, limit = 20, search, status, branch } = req.query;
  const query = { company: req.user.company._id };

  // Branch/shift-scoped: supervisors only see their branch (and optionally their shift)
  const isAdmin = req.user.role === 'super_admin' || req.user.can('manageBranches');
  if (!isAdmin) {
    if (req.user.branchId) query.branchId = req.user.branchId;
    if (req.user.can('viewOwnShift') && req.user.shiftId) query.shiftId = req.user.shiftId;
  }

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { phone:    { $regex: search, $options: 'i' } }
    ];
  }
  if (status) {
    if (status === 'verified') {
      query.verificationStatus = { $in: ['verified', 'fully_verified'] };
    } else {
      query.verificationStatus = status;
    }
  }
  if (branch) query.branch = { $regex: branch, $options: 'i' };

  const total   = await Worker.countDocuments(query);
  const workers = await Worker.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('addedBy', 'name');

  res.json({
    success: true,
    data: workers,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
};

// ─── GET /api/workers/active-workers ─────────────────────────────────────────
const getActiveWorkers = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, shiftId, role, status, search, page = 1, limit = 20 } = req.query;

  const filter = { company: cid };

  // Branch/shift-scoped: supervisors only see their assigned branch + optionally shift
  const isAdmin = req.user.role === 'super_admin' || req.user.can('manageBranches');
  if (!isAdmin) {
    if (req.user.branchId) filter.branchId = req.user.branchId;
    if (req.user.can('viewOwnShift') && req.user.shiftId) filter.shiftId = req.user.shiftId;
  }

  if (status) {
    filter.employmentStatus = status;
  } else {
    filter.employmentStatus = { $in: ['active', 'suspended', 'sacked', 'inactive'] };
  }

  if (branchId && isAdmin) filter.branchId = branchId;
  if (shiftId)  filter.shiftId  = shiftId;
  if (role)     filter.role = { $regex: role, $options: 'i' };
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { phone:    { $regex: search, $options: 'i' } }
    ];
  }

  const total   = await Worker.countDocuments(filter);
  const workers = await Worker.find(filter)
    .populate('branchId', 'name')
    .populate('shiftId',  'name startTime endTime')
    .populate('activatedBy', 'name')
    .select('fullName role branch branchId shiftId schedule passportPhoto verificationStatus employmentStatus activatedAt phone salary')
    .sort({ employmentStatus: 1, fullName: 1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.json({
    success: true,
    data: workers,
    pagination: { page: Number(page), pages: Math.ceil(total / limit), total }
  });
};

// ─── GET /api/workers/:id ────────────────────────────────────────────────────
const getWorker = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('addedBy',               'name')
    .populate('houseVerification.verifiedBy', 'name')
    .populate('branchId',              'name address phone')
    .populate('shiftId',               'name startTime endTime days')
    .populate('approvedBy',            'name')
    .populate('rejectedBy',            'name')
    .populate('submittedForApprovalBy','name')
    .populate('activatedBy',           'name')
    .populate('suspendedBy',           'name')
    .populate('sackedBy',              'name')
    .populate('employmentHistory.performedBy', 'name');

  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers ───────────────────────────────────────────────────────
const createWorker = async (req, res) => {
  const { fullName, phone, address, branch, role } = req.body;
  const data = {
    company: req.user.company._id,
    fullName, phone, address, branch, role,
    addedBy: req.user._id
  };

  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, `${req.user.company._id}/workers/photos`, 'image');
    data.passportPhoto = { url: result.secure_url, publicId: result.public_id };
  }

  const worker = await Worker.create(data);
  res.status(201).json({ success: true, data: worker });
};

// ─── PUT /api/workers/:id ────────────────────────────────────────────────────
const updateWorker = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const { fullName, phone, address, branch, role } = req.body;
  if (fullName) worker.fullName = fullName;
  if (phone)    worker.phone    = phone;
  if (address)  worker.address  = address;
  if (branch)   worker.branch   = branch;
  if (role)     worker.role     = role;

  if (req.file) {
    if (worker.passportPhoto?.publicId) await deleteFromCloudinary(worker.passportPhoto.publicId);
    const result = await uploadToCloudinary(req.file.buffer, `${req.user.company._id}/workers/photos`, 'image');
    worker.passportPhoto = { url: result.secure_url, publicId: result.public_id };
  }

  await worker.save();
  await recalcStatus(worker._id);
  res.json({ success: true, data: worker });
};

// ─── DELETE /api/workers/:id ─────────────────────────────────────────────────
const deleteWorker = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  if (worker.passportPhoto?.publicId) await deleteFromCloudinary(worker.passportPhoto.publicId);
  if (worker.signature?.publicId)     await deleteFromCloudinary(worker.signature.publicId);
  for (const doc of worker.verificationDocuments) {
    if (doc.file?.publicId) await deleteFromCloudinary(doc.file.publicId);
  }
  for (const photo of (worker.houseVerification?.photos || [])) {
    if (photo.publicId) await deleteFromCloudinary(photo.publicId);
  }

  await Guarantor.deleteMany({ worker: worker._id });
  await worker.deleteOne();
  res.json({ success: true, message: 'Worker deleted successfully' });
};

// ─── POST /api/workers/:id/signature ─────────────────────────────────────────
const uploadSignature = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No signature file provided' });

  if (worker.signature?.publicId) await deleteFromCloudinary(worker.signature.publicId);

  const result = await uploadToCloudinary(req.file.buffer, `${req.user.company._id}/workers/signatures`, 'image');
  worker.signature = { url: result.secure_url, publicId: result.public_id, uploadedAt: new Date() };
  await worker.save();
  await recalcStatus(worker._id);
  res.json({ success: true, data: worker });
};

// ─── PUT /api/workers/:id/address-location ───────────────────────────────────
const updateAddressLocation = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const { formatted, lat, lng, address, plusCode } = req.body;

  if (address) worker.address = address;
  if (formatted || (lat && lng)) {
    worker.addressLocation = {
      formatted:   formatted || worker.addressLocation?.formatted,
      coordinates: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : worker.addressLocation?.coordinates,
      plusCode:    plusCode   || worker.addressLocation?.plusCode || ''
    };
  }

  await worker.save();
  await recalcStatus(worker._id);
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/verification ─────────────────────────────────────
const uploadVerificationDoc = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const { docType, documentNumber } = req.body;
  if (!docType || !VALID_DOC_TYPES.includes(docType)) {
    return res.status(400).json({ success: false, message: 'Invalid or missing document type' });
  }

  const docEntry = { type: docType, documentNumber: documentNumber || '', uploadedAt: new Date() };

  if (req.file) {
    const isPdf = req.file.mimetype === 'application/pdf';
    const result = await uploadToCloudinary(
      req.file.buffer,
      `${req.user.company._id}/workers/verification`,
      isPdf ? 'raw' : 'image'
    );
    docEntry.file = { url: result.secure_url, publicId: result.public_id, fileType: isPdf ? 'pdf' : 'image' };
  }

  // Replace existing doc of same type
  const existing = worker.verificationDocuments.find(d => d.type === docType);
  if (existing?.file?.publicId) await deleteFromCloudinary(existing.file.publicId);
  worker.verificationDocuments = worker.verificationDocuments.filter(d => d.type !== docType);
  worker.verificationDocuments.push(docEntry);

  await worker.save();
  await recalcStatus(worker._id);
  res.json({ success: true, data: worker });
};

// ─── DELETE /api/workers/:id/verification/:docId ─────────────────────────────
const deleteVerificationDoc = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const doc = worker.verificationDocuments.id(req.params.docId);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  if (doc.file?.publicId) await deleteFromCloudinary(doc.file.publicId);
  worker.verificationDocuments.pull(req.params.docId);
  await worker.save();
  await recalcStatus(worker._id);
  res.json({ success: true, data: worker });
};

// ─── PUT /api/workers/:id/verification-status ────────────────────────────────
const updateVerificationStatus = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const { status } = req.body;
  const valid = ['pending', 'partially_verified', 'fully_verified', 'verified'];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }

  worker.verificationStatus = status;
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── PUT /api/workers/:id/house ───────────────────────────────────────────────
const updateHouseVerification = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const { lat, lng, address, formattedAddress, notes } = req.body;
  if (!worker.houseVerification) worker.houseVerification = {};

  if (lat && lng) worker.houseVerification.coordinates = { lat: parseFloat(lat), lng: parseFloat(lng) };
  if (address)          worker.houseVerification.address          = address;
  if (formattedAddress) worker.houseVerification.formattedAddress = formattedAddress;
  if (notes)            worker.houseVerification.notes            = notes;
  worker.houseVerification.verifiedBy = req.user._id;
  worker.houseVerification.verifiedAt = new Date();

  if (req.files?.length) {
    if (!worker.houseVerification.photos) worker.houseVerification.photos = [];
    const { photoType = 'other' } = req.body;
    for (const file of req.files) {
      const result = await uploadToCloudinary(file.buffer, `${req.user.company._id}/workers/house`, 'image');
      worker.houseVerification.photos.push({ url: result.secure_url, publicId: result.public_id, photoType });
    }
  }

  await worker.save();
  await recalcStatus(worker._id);
  res.json({ success: true, data: worker });
};

// ─── DELETE /api/workers/:id/house/photos/:photoId ───────────────────────────
const deleteHousePhoto = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const photo = worker.houseVerification?.photos?.id(req.params.photoId);
  if (!photo) return res.status(404).json({ success: false, message: 'Photo not found' });

  if (photo.publicId) await deleteFromCloudinary(photo.publicId);
  worker.houseVerification.photos.pull(req.params.photoId);
  await worker.save();
  await recalcStatus(worker._id);
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/submit-approval ────────────────────────────────────
const submitForApproval = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  if (['verified', 'rejected'].includes(worker.verificationStatus)) {
    return res.status(400).json({ success: false, message: `Worker is already ${worker.verificationStatus}` });
  }

  worker.verificationStatus        = 'pending_approval';
  worker.submittedForApprovalAt    = new Date();
  worker.submittedForApprovalBy    = req.user._id;
  worker.rejectionReason           = undefined;
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/approve ───────────────────────────────────────────
const approveWorker = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  worker.verificationStatus = 'verified';
  worker.approvedBy         = req.user._id;
  worker.approvedAt         = new Date();
  worker.rejectionReason    = undefined;
  worker.rejectedBy         = undefined;
  worker.rejectedAt         = undefined;
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/reject ────────────────────────────────────────────
const rejectWorker = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const { reason } = req.body;
  if (!reason?.trim()) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required' });
  }

  worker.verificationStatus = 'rejected';
  worker.rejectedBy         = req.user._id;
  worker.rejectedAt         = new Date();
  worker.rejectionReason    = reason.trim();
  worker.approvedBy         = undefined;
  worker.approvedAt         = undefined;
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/activate ──────────────────────────────────────────
const activateWorker = async (req, res) => {
  const { branchId, shiftId, role, schedule, notes, resumptionDate } = req.body;
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const prevBranch   = worker.branch;
  const prevRole     = worker.role;
  const prevSchedule = worker.schedule;

  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, company: req.user.company._id, isActive: true });
    if (!branch) return res.status(400).json({ success: false, message: 'Branch not found or inactive' });
    worker.branchId = branch._id;
    worker.branch   = branch.name;
  }
  if (shiftId) {
    const shift = await Shift.findOne({ _id: shiftId, company: req.user.company._id });
    if (shift) {
      worker.shiftId  = shift._id;
      worker.schedule = shift.name;
    }
  } else if (schedule) {
    worker.schedule = schedule.trim();
    worker.shiftId  = undefined;
  }
  if (role) worker.role = role.trim();

  worker.employmentStatus = 'active';
  worker.activatedAt      = new Date();
  worker.activatedBy      = req.user._id;
  if (resumptionDate) worker.resumptionDate = new Date(resumptionDate);
  else if (!worker.resumptionDate) worker.resumptionDate = new Date();

  worker.employmentHistory.push({
    action:       'activated',
    fromBranch:   prevBranch,
    toBranch:     worker.branch,
    fromRole:     prevRole,
    toRole:       worker.role,
    fromSchedule: prevSchedule,
    toSchedule:   worker.schedule,
    notes,
    date:         new Date(),
    performedBy:  req.user._id
  });

  await worker.save();
  await worker.populate('branchId', 'name');
  await worker.populate('shiftId',  'name startTime endTime');
  await worker.populate('activatedBy', 'name');
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/suspend ───────────────────────────────────────────
const suspendWorker = async (req, res) => {
  const { reason, notes, date } = req.body;
  if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Suspension reason is required' });

  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  if (worker.employmentStatus === 'sacked') {
    return res.status(400).json({ success: false, message: 'Cannot suspend a sacked worker' });
  }

  worker.employmentStatus  = 'suspended';
  worker.suspensionReason  = reason.trim();
  worker.suspendedAt       = date ? new Date(date) : new Date();
  worker.suspendedBy       = req.user._id;

  worker.employmentHistory.push({
    action: 'suspended',
    reason: reason.trim(), notes,
    date:        worker.suspendedAt,
    performedBy: req.user._id
  });

  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/sack ──────────────────────────────────────────────
const sackWorker = async (req, res) => {
  const { reason, notes, date } = req.body;
  if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Reason for sacking is required' });

  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  worker.employmentStatus = 'sacked';
  worker.sackReason       = reason.trim();
  worker.sackedAt         = date ? new Date(date) : new Date();
  worker.sackedBy         = req.user._id;

  worker.employmentHistory.push({
    action: 'sacked',
    reason: reason.trim(), notes,
    date:        worker.sackedAt,
    performedBy: req.user._id
  });

  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/reactivate ────────────────────────────────────────
const reactivateWorker = async (req, res) => {
  const { notes } = req.body;
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const prevStatus        = worker.employmentStatus;
  worker.employmentStatus = 'active';
  worker.activatedAt      = new Date();
  worker.activatedBy      = req.user._id;

  worker.employmentHistory.push({
    action:      'reactivated',
    reason:      `Reactivated from ${prevStatus}`,
    notes,
    date:        new Date(),
    performedBy: req.user._id
  });

  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/transfer ──────────────────────────────────────────
const transferWorker = async (req, res) => {
  const { branchId, shiftId, role, schedule, reason, notes } = req.body;
  if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Transfer reason is required' });

  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const prevBranch   = worker.branch;
  const prevRole     = worker.role;
  const prevSchedule = worker.schedule;

  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, company: req.user.company._id, isActive: true });
    if (!branch) return res.status(400).json({ success: false, message: 'Branch not found or inactive' });
    worker.branchId = branch._id;
    worker.branch   = branch.name;
  }
  if (shiftId) {
    const shift = await Shift.findOne({ _id: shiftId, company: req.user.company._id });
    if (shift) {
      worker.shiftId  = shift._id;
      worker.schedule = shift.name;
    }
  } else if (schedule) {
    worker.schedule = schedule.trim();
    worker.shiftId  = undefined;
  }
  if (role) worker.role = role.trim();

  worker.employmentHistory.push({
    action:       'transferred',
    fromBranch:   prevBranch,
    toBranch:     worker.branch,
    fromRole:     prevRole,
    toRole:       worker.role,
    fromSchedule: prevSchedule,
    toSchedule:   worker.schedule,
    reason:       reason.trim(), notes,
    date:         new Date(),
    performedBy:  req.user._id
  });

  await worker.save();
  await worker.populate('branchId', 'name');
  await worker.populate('shiftId',  'name startTime endTime');
  res.json({ success: true, data: worker });
};

// ─── PUT /api/workers/:id/salary ─────────────────────────────────────────────
const updateSalary = async (req, res) => {
  const { monthly, paymentStatus, payrollEnabled } = req.body;
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  if (!worker.salary) worker.salary = {};
  if (monthly        !== undefined) worker.salary.monthly        = Number(monthly);
  if (paymentStatus  !== undefined) worker.salary.paymentStatus  = paymentStatus;
  if (payrollEnabled !== undefined) worker.salary.payrollEnabled = Boolean(payrollEnabled);
  worker.markModified('salary');

  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── PUT /api/workers/:id/bank ───────────────────────────────────────────────
const updateBank = async (req, res) => {
  const { bankName, accountNumber, accountName } = req.body;
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  worker.bankDetails = {
    bankName:      bankName?.trim()      || '',
    accountNumber: accountNumber?.trim() || '',
    accountName:   accountName?.trim()   || ''
  };
  worker.markModified('bankDetails');

  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── GET /api/workers/approval-queue ─────────────────────────────────────────
const getApprovalQueue = async (req, res) => {
  const workers = await Worker.find({
    company: req.user.company._id,
    verificationStatus: 'pending_approval'
  })
    .sort({ submittedForApprovalAt: 1 })
    .populate('addedBy', 'name')
    .populate('submittedForApprovalBy', 'name');

  // Attach guarantor counts
  const withGuarantors = await Promise.all(
    workers.map(async (w) => {
      const guarantorCount = await Guarantor.countDocuments({ worker: w._id });
      return { ...w.toObject(), guarantorCount };
    })
  );

  res.json({ success: true, data: withGuarantors });
};

// ─── PUT /api/workers/:id/registration-date  (super admin only) ──────────────
const updateRegistrationDate = async (req, res) => {
  const { registrationDate } = req.body;
  if (!registrationDate) return res.status(400).json({ success: false, message: 'registrationDate is required' });

  const date = new Date(registrationDate);
  if (isNaN(date.getTime())) return res.status(400).json({ success: false, message: 'Invalid date' });

  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  worker.registeredAt = date;
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── PUT /api/workers/:id/resumption ─────────────────────────────────────────
const updateResumptionDate = async (req, res) => {
  const { resumptionDate } = req.body;

  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  // Allow clearing the date by passing null or empty string
  worker.resumptionDate = resumptionDate ? new Date(resumptionDate) : undefined;
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/authorised-signature ──────────────────────────────
const uploadAuthorisedSignature = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No signature file provided' });

  if (worker.authorisedSignature?.publicId)
    await deleteFromCloudinary(worker.authorisedSignature.publicId);

  const result = await uploadToCloudinary(
    req.file.buffer, `${req.user.company._id}/workers/authorised-signatures`, 'image'
  );
  worker.authorisedSignature = {
    url:          result.secure_url,
    publicId:     result.public_id,
    authorisedBy: req.body.authorisedBy || req.user.name || '',
    authorisedAt: new Date()
  };
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/:id/company-stamp ────────────────────────────────────
const uploadCompanyStamp = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No stamp file provided' });

  if (worker.companyStamp?.publicId)
    await deleteFromCloudinary(worker.companyStamp.publicId);

  const result = await uploadToCloudinary(
    req.file.buffer, `${req.user.company._id}/workers/stamps`, 'image'
  );
  worker.companyStamp = { url: result.secure_url, publicId: result.public_id, uploadedAt: new Date() };
  await worker.save();
  res.json({ success: true, data: worker });
};

// ─── POST /api/workers/self-reset-pin  (PUBLIC — worker resets own PIN via phone verification) ──
const selfResetPin = async (req, res) => {
  const { workerId, phone, newPin } = req.body;

  if (!workerId || !phone || !newPin)
    return res.status(400).json({ success: false, message: 'workerId, phone and newPin are required' });
  if (!/^\d{4}$/.test(String(newPin)))
    return res.status(400).json({ success: false, message: 'New PIN must be exactly 4 digits' });

  // Find worker and verify phone matches
  const worker = await Worker.findOne({ _id: workerId, employmentStatus: 'active' });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found or not active' });

  // Normalise phone: strip spaces and leading zeros/country codes for comparison
  const normalise = p => String(p).replace(/\s+/g, '').replace(/^(\+234|234|0)/, '');
  if (normalise(worker.phone) !== normalise(phone))
    return res.status(400).json({ success: false, message: 'Phone number does not match our records' });

  // Ensure new PIN is not already used by someone else in the same company
  const conflict = await Worker.findOne({
    pin:     String(newPin),
    company: worker.company,
    _id:     { $ne: worker._id }
  });
  if (conflict)
    return res.status(400).json({ success: false, message: 'That PIN is already in use — choose a different one' });

  worker.pin = String(newPin);
  await worker.save();

  res.json({
    success: true,
    message: 'PIN reset successfully — use your new PIN on the attendance terminal',
  });
};

// ─── POST /api/workers/search-by-name  (PUBLIC — for PIN reset worker search) ──
const searchByName = async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2)
    return res.status(400).json({ success: false, message: 'Enter at least 2 characters' });

  const workers = await Worker.find({
    fullName:         { $regex: q.trim(), $options: 'i' },
    employmentStatus: 'active',
  })
    .select('fullName role branch passportPhoto')
    .limit(8)
    .lean();

  res.json({
    success: true,
    data: workers.map(w => ({
      _id:      w._id,
      fullName: w.fullName,
      role:     w.role,
      branch:   w.branch,
      photo:    w.passportPhoto?.url,
    }))
  });
};

// ─── GET /api/workers/pins  (super admin — list all workers + their PINs) ─────
const getWorkerPins = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId } = req.query;
  const filter = { company: cid };
  if (branchId) filter.branchId = branchId;

  const workers = await Worker.find(filter)
    .select('fullName role branch branchId employmentStatus pin passportPhoto')
    .populate('branchId', 'name')
    .sort({ branch: 1, fullName: 1 })
    .lean();

  res.json({ success: true, data: workers });
};

// ─── POST /api/workers/bulk-generate-pins  (super admin — generate PINs for all workers without one) ───
const bulkGeneratePins = async (req, res) => {
  const cid = req.user.company._id;
  const { overwrite = false } = req.body; // if true, regenerate even existing PINs

  // Get all existing PINs in this company to avoid duplicates
  const existing = await Worker.find({ company: cid, pin: { $exists: true, $ne: null, $ne: '' } })
    .select('pin').lean();
  const usedPins = new Set(existing.map(w => w.pin));

  // Generate a unique 4-digit PIN
  const generatePin = () => {
    let attempts = 0;
    while (attempts < 10000) {
      const p = String(Math.floor(1000 + Math.random() * 9000)); // 1000-9999
      if (!usedPins.has(p)) { usedPins.add(p); return p; }
      attempts++;
    }
    throw new Error('Cannot generate unique PIN — too many workers');
  };

  // Find workers that need a PIN
  const query = { company: cid };
  if (!overwrite) query.$or = [{ pin: { $exists: false } }, { pin: null }, { pin: '' }];

  const workers = await Worker.find(query).select('_id fullName pin').lean();
  if (workers.length === 0)
    return res.json({ success: true, message: 'All workers already have PINs', updated: 0 });

  // Assign PINs in bulk
  const bulkOps = workers.map(w => {
    const pin = generatePin();
    return {
      updateOne: {
        filter: { _id: w._id },
        update: { $set: { pin } }
      }
    };
  });

  await Worker.bulkWrite(bulkOps);

  res.json({
    success: true,
    message: `Generated PINs for ${workers.length} worker${workers.length !== 1 ? 's' : ''}`,
    updated: workers.length
  });
};

// ─── PUT /api/workers/:id/pin  (super admin sets worker PIN) ─────────────────
const updateWorkerPin = async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(String(pin)))
    return res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits' });

  // Check PIN is not already used by another worker
  const existing = await Worker.findOne({ pin: String(pin), _id: { $ne: req.params.id } });
  if (existing)
    return res.status(400).json({ success: false, message: 'This PIN is already in use by another worker' });

  const worker = await Worker.findOneAndUpdate(
    { _id: req.params.id, company: req.user.company._id },
    { pin: String(pin) },
    { new: true }
  );
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  res.json({ success: true, message: 'PIN updated', data: { pin: worker.pin } });
};

module.exports = {
  getStats, getWorkers, getWorker, createWorker, updateWorker, deleteWorker,
  getWorkerPins, bulkGeneratePins, selfResetPin, searchByName,
  uploadSignature, updateAddressLocation,
  uploadVerificationDoc, deleteVerificationDoc, updateVerificationStatus,
  updateHouseVerification, deleteHousePhoto,
  submitForApproval, approveWorker, rejectWorker, getApprovalQueue,
  updateRegistrationDate, updateResumptionDate,
  uploadAuthorisedSignature, uploadCompanyStamp,
  // Employment management
  getActiveWorkers,
  activateWorker, suspendWorker, sackWorker, reactivateWorker, transferWorker,
  updateSalary, updateBank,
  updateWorkerPin
};
