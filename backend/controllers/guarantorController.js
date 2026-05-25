const Worker    = require('../models/Worker');
const Guarantor = require('../models/Guarantor');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

// Pull in the shared recalc helper via lazy require to avoid circular deps
const recalcStatus = async (workerId) => {
  const { default: workerCtrl } = await Promise.resolve()
    .then(() => ({ default: require('./workerController') }));
  // We re-implement it here to avoid circularity
  const Worker2    = require('../models/Worker');
  const Guarantor2 = require('../models/Guarantor');

  const worker = await Worker2.findById(workerId);
  if (!worker) return;
  const guarantorCount = await Guarantor2.countDocuments({ worker: workerId });
  const checks = [
    !!worker.passportPhoto?.url,
    !!worker.signature?.url,
    !!(worker.addressLocation?.coordinates?.lat || worker.address),
    (worker.verificationDocuments?.length || 0) > 0,
    guarantorCount >= 1,
    guarantorCount >= 2,
    (worker.houseVerification?.photos?.length || 0) > 0
  ];
  const score  = checks.filter(Boolean).length;
  const status = score === checks.length ? 'fully_verified' : score > 0 ? 'partially_verified' : 'pending';
  if (worker.verificationStatus !== status) {
    await Worker2.findByIdAndUpdate(workerId, { verificationStatus: status });
  }
};

const assertWorker = async (workerId, companyId) => {
  const w = await Worker.findOne({ _id: workerId, company: companyId });
  if (!w) throw Object.assign(new Error('Worker not found'), { statusCode: 404 });
  return w;
};

// ─── GET /api/workers/:workerId/guarantors ───────────────────────────────────
const getGuarantors = async (req, res) => {
  await assertWorker(req.params.workerId, req.user.company._id);
  const guarantors = await Guarantor.find({ worker: req.params.workerId, company: req.user.company._id })
    .populate('addedBy', 'name');
  res.json({ success: true, data: guarantors });
};

// ─── GET /api/workers/:workerId/guarantors/:guarantorId ──────────────────────
const getGuarantor = async (req, res) => {
  await assertWorker(req.params.workerId, req.user.company._id);
  const g = await Guarantor.findOne({
    _id: req.params.guarantorId, worker: req.params.workerId, company: req.user.company._id
  }).populate('addedBy', 'name');
  if (!g) return res.status(404).json({ success: false, message: 'Guarantor not found' });
  res.json({ success: true, data: g });
};

// ─── POST /api/workers/:workerId/guarantors ──────────────────────────────────
const addGuarantor = async (req, res) => {
  await assertWorker(req.params.workerId, req.user.company._id);
  const count = await Guarantor.countDocuments({ worker: req.params.workerId });
  if (count >= 2) {
    return res.status(400).json({ success: false, message: 'A worker can only have 2 guarantors' });
  }

  const { fullName, phone, address, relationship, idDocType, documentNumber,
          lat, lng, houseAddress, formattedAddress, houseFormattedAddress } = req.body;

  const data = {
    worker: req.params.workerId, company: req.user.company._id,
    fullName, phone, address, relationship,
    addedBy: req.user._id,
    idDocument: { type: idDocType, documentNumber: documentNumber || '' }
  };

  if (req.files?.passportPhoto?.[0]) {
    const r = await uploadToCloudinary(req.files.passportPhoto[0].buffer, `${req.user.company._id}/guarantors/photos`, 'image');
    data.passportPhoto = { url: r.secure_url, publicId: r.public_id };
  }

  if (req.files?.idDocument?.[0]) {
    const f = req.files.idDocument[0];
    const pdf = f.mimetype === 'application/pdf';
    const r = await uploadToCloudinary(f.buffer, `${req.user.company._id}/guarantors/ids`, pdf ? 'raw' : 'image');
    data.idDocument.file = { url: r.secure_url, publicId: r.public_id, fileType: pdf ? 'pdf' : 'image' };
  }

  if (lat && lng) {
    data.houseLocation = {
      coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) },
      address: houseAddress || '',
      formattedAddress: houseFormattedAddress || ''
    };
  }

  const guarantor = await Guarantor.create(data);
  await recalcStatus(req.params.workerId);
  res.status(201).json({ success: true, data: guarantor });
};

// ─── PUT /api/workers/:workerId/guarantors/:guarantorId ──────────────────────
const updateGuarantor = async (req, res) => {
  await assertWorker(req.params.workerId, req.user.company._id);
  const g = await Guarantor.findOne({
    _id: req.params.guarantorId, worker: req.params.workerId, company: req.user.company._id
  });
  if (!g) return res.status(404).json({ success: false, message: 'Guarantor not found' });

  const { fullName, phone, address, relationship, idDocType, documentNumber,
          lat, lng, houseAddress, houseFormattedAddress } = req.body;

  if (fullName)     g.fullName     = fullName;
  if (phone)        g.phone        = phone;
  if (address)      g.address      = address;
  if (relationship) g.relationship = relationship;

  if (idDocType) {
    g.idDocument       = g.idDocument || {};
    g.idDocument.type  = idDocType;
    if (documentNumber) g.idDocument.documentNumber = documentNumber;
  }

  if (req.files?.passportPhoto?.[0]) {
    if (g.passportPhoto?.publicId) await deleteFromCloudinary(g.passportPhoto.publicId);
    const r = await uploadToCloudinary(req.files.passportPhoto[0].buffer, `${req.user.company._id}/guarantors/photos`, 'image');
    g.passportPhoto = { url: r.secure_url, publicId: r.public_id };
  }

  if (req.files?.idDocument?.[0]) {
    if (g.idDocument?.file?.publicId) await deleteFromCloudinary(g.idDocument.file.publicId);
    const f = req.files.idDocument[0];
    const pdf = f.mimetype === 'application/pdf';
    const r = await uploadToCloudinary(f.buffer, `${req.user.company._id}/guarantors/ids`, pdf ? 'raw' : 'image');
    g.idDocument.file = { url: r.secure_url, publicId: r.public_id, fileType: pdf ? 'pdf' : 'image' };
  }

  if (lat && lng) {
    g.houseLocation = g.houseLocation || {};
    g.houseLocation.coordinates    = { lat: parseFloat(lat), lng: parseFloat(lng) };
    if (houseAddress)          g.houseLocation.address          = houseAddress;
    if (houseFormattedAddress) g.houseLocation.formattedAddress = houseFormattedAddress;
  }

  await g.save();
  await recalcStatus(req.params.workerId);
  res.json({ success: true, data: g });
};

// ─── POST /api/workers/:workerId/guarantors/:guarantorId/signature ────────────
const uploadGuarantorSignature = async (req, res) => {
  await assertWorker(req.params.workerId, req.user.company._id);
  const g = await Guarantor.findOne({
    _id: req.params.guarantorId, worker: req.params.workerId, company: req.user.company._id
  });
  if (!g) return res.status(404).json({ success: false, message: 'Guarantor not found' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No signature file provided' });

  if (g.signature?.publicId) await deleteFromCloudinary(g.signature.publicId);
  const r = await uploadToCloudinary(req.file.buffer, `${req.user.company._id}/guarantors/signatures`, 'image');
  g.signature = { url: r.secure_url, publicId: r.public_id, uploadedAt: new Date() };
  await g.save();
  res.json({ success: true, data: g });
};

// ─── DELETE /api/workers/:workerId/guarantors/:guarantorId ───────────────────
const deleteGuarantor = async (req, res) => {
  await assertWorker(req.params.workerId, req.user.company._id);
  const g = await Guarantor.findOne({
    _id: req.params.guarantorId, worker: req.params.workerId, company: req.user.company._id
  });
  if (!g) return res.status(404).json({ success: false, message: 'Guarantor not found' });

  if (g.passportPhoto?.publicId)    await deleteFromCloudinary(g.passportPhoto.publicId);
  if (g.signature?.publicId)        await deleteFromCloudinary(g.signature.publicId);
  if (g.idDocument?.file?.publicId) await deleteFromCloudinary(g.idDocument.file.publicId);
  for (const p of g.houseLocation?.photos || []) {
    if (p.publicId) await deleteFromCloudinary(p.publicId);
  }

  await g.deleteOne();
  await recalcStatus(req.params.workerId);
  res.json({ success: true, message: 'Guarantor deleted' });
};

// ─── POST /api/workers/:workerId/guarantors/:guarantorId/house-photos ────────
const addGuarantorHousePhotos = async (req, res) => {
  await assertWorker(req.params.workerId, req.user.company._id);
  const g = await Guarantor.findOne({
    _id: req.params.guarantorId, worker: req.params.workerId, company: req.user.company._id
  });
  if (!g)             return res.status(404).json({ success: false, message: 'Guarantor not found' });
  if (!req.files?.length) return res.status(400).json({ success: false, message: 'No photos provided' });

  g.houseLocation        = g.houseLocation        || {};
  g.houseLocation.photos = g.houseLocation.photos || [];
  const { photoType = 'other' } = req.body;

  for (const file of req.files) {
    const r = await uploadToCloudinary(file.buffer, `${req.user.company._id}/guarantors/house`, 'image');
    g.houseLocation.photos.push({ url: r.secure_url, publicId: r.public_id, photoType });
  }

  await g.save();
  res.json({ success: true, data: g });
};

module.exports = {
  getGuarantors, getGuarantor, addGuarantor, updateGuarantor, deleteGuarantor,
  uploadGuarantorSignature, addGuarantorHousePhotos
};
