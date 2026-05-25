const Worker    = require('../models/Worker');
const Guarantor = require('../models/Guarantor');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

const VALID_DOC_TYPES = ['nin', 'voter_card', 'drivers_license', 'national_id', 'international_passport'];

// ─── Auto-calculate verification status ──────────────────────────────────────
const recalcStatus = async (workerId) => {
  const worker = await Worker.findById(workerId);
  if (!worker) return;
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

  const status = score === checks.length
    ? 'fully_verified'
    : score > 0
      ? 'partially_verified'
      : 'pending';

  if (worker.verificationStatus !== status) {
    await Worker.findByIdAndUpdate(workerId, { verificationStatus: status });
  }
};

// ─── GET /api/workers/stats ──────────────────────────────────────────────────
const getStats = async (req, res) => {
  const cid = req.user.company._id;
  const [total, fullyVerified, partial, pending, guarantorWorkers] = await Promise.all([
    Worker.countDocuments({ company: cid }),
    Worker.countDocuments({ company: cid, verificationStatus: { $in: ['fully_verified', 'verified'] } }),
    Worker.countDocuments({ company: cid, verificationStatus: 'partially_verified' }),
    Worker.countDocuments({ company: cid, verificationStatus: 'pending' }),
    Guarantor.aggregate([
      { $match: { company: cid } },
      { $group: { _id: '$worker' } },
      { $count: 'total' }
    ])
  ]);
  res.json({
    success: true,
    data: { total, verified: fullyVerified, partial, pending, withGuarantors: guarantorWorkers[0]?.total || 0 }
  });
};

// ─── GET /api/workers ────────────────────────────────────────────────────────
const getWorkers = async (req, res) => {
  const { page = 1, limit = 20, search, status, branch } = req.query;
  const query = { company: req.user.company._id };

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

// ─── GET /api/workers/:id ────────────────────────────────────────────────────
const getWorker = async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('addedBy', 'name')
    .populate('houseVerification.verifiedBy', 'name');

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

  const { formatted, lat, lng, address } = req.body;

  if (address)            worker.address = address;
  if (formatted || (lat && lng)) {
    worker.addressLocation = {
      formatted:   formatted || worker.addressLocation?.formatted,
      coordinates: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : worker.addressLocation?.coordinates
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

module.exports = {
  getStats, getWorkers, getWorker, createWorker, updateWorker, deleteWorker,
  uploadSignature, updateAddressLocation,
  uploadVerificationDoc, deleteVerificationDoc, updateVerificationStatus,
  updateHouseVerification, deleteHousePhoto
};
