const Document          = require('../models/Document');
const DocumentSignature = require('../models/DocumentSignature');
const Worker            = require('../models/Worker');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

// ── helper: verify PIN and return worker ──────────────────────────────────────
async function workerByPin(pin) {
  if (!pin) return null;
  return Worker.findOne({ pin: String(pin).trim(), employmentStatus: 'active' }).lean();
}

// ── helper: derive fileType label from mimetype ───────────────────────────────
function mimeToFileType(mimetype = '') {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.startsWith('image/'))  return 'image';
  if (mimetype.includes('word'))      return 'word';
  return 'other';
}

// ── helper: is this worker a target of this document? ────────────────────────
function isTarget(doc, worker) {
  if (doc.targetType === 'all') return true;
  if (doc.targetType === 'role') {
    return (doc.targetRoles || []).some(
      r => r.toLowerCase() === (worker.role || '').toLowerCase()
    );
  }
  return (doc.targetWorkers || []).some(id => String(id) === String(worker._id));
}

// ── helper: fetch workers matching doc target ─────────────────────────────────
async function fetchTargetWorkers(doc, companyId) {
  if (doc.targetType === 'all') {
    return Worker.find({ company: companyId, employmentStatus: 'active' })
      .select('_id fullName role branchId').populate('branchId', 'name').lean();
  }
  if (doc.targetType === 'role') {
    const roleRegexes = (doc.targetRoles || []).map(r => new RegExp(`^${r}$`, 'i'));
    return Worker.find({ company: companyId, employmentStatus: 'active', role: { $in: roleRegexes } })
      .select('_id fullName role branchId').populate('branchId', 'name').lean();
  }
  return Worker.find({ _id: { $in: doc.targetWorkers }, company: companyId })
    .select('_id fullName role branchId').populate('branchId', 'name').lean();
}

// ── GET /api/documents  (admin) ───────────────────────────────────────────────
const getDocuments = async (req, res) => {
  const cid  = req.user.company._id;
  const docs = await Document.find({ company: cid })
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const counts = await DocumentSignature.aggregate([
    { $match: { company: cid } },
    { $group: { _id: '$document', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach(c => { countMap[String(c._id)] = c.count; });

  const data = docs.map(d => ({ ...d, signatureCount: countMap[String(d._id)] || 0 }));
  res.json({ success: true, data });
};

// ── GET /api/documents/:id  (admin) ───────────────────────────────────────────
const getDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('createdBy', 'name')
    .populate('targetWorkers', 'fullName role branchId')
    .lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  res.json({ success: true, data: doc });
};

// ── POST /api/documents  (admin) — multipart/form-data ───────────────────────
const createDocument = async (req, res) => {
  const { title, body, type, requiresSignature, targetType, targetWorkers, targetRoles } = req.body;
  if (!title?.trim())
    return res.status(400).json({ success: false, message: 'Title is required' });

  let fileUrl = null, fileName = null, filePublicId = null, fileType = null;
  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, 'documents', 'auto');
    fileUrl       = result.secure_url;
    filePublicId  = result.public_id;
    fileName      = req.file.originalname;
    fileType      = mimeToFileType(req.file.mimetype);
  }

  const parsedTargetWorkers = typeof targetWorkers === 'string' ? JSON.parse(targetWorkers || '[]') : (targetWorkers || []);
  const parsedTargetRoles   = typeof targetRoles   === 'string' ? JSON.parse(targetRoles   || '[]') : (targetRoles   || []);

  const doc = await Document.create({
    company:           req.user.company._id,
    title:             title.trim(),
    body:              body || '',
    type:              type || 'handbook',
    requiresSignature: requiresSignature === 'false' ? false : true,
    targetType:        targetType || 'all',
    targetWorkers:     targetType === 'selected' ? parsedTargetWorkers : [],
    targetRoles:       targetType === 'role'     ? parsedTargetRoles   : [],
    fileUrl, fileName, filePublicId, fileType,
    createdBy: req.user._id,
    status:    'draft',
  });
  res.status(201).json({ success: true, data: doc });
};

// ── PUT /api/documents/:id  (admin) ───────────────────────────────────────────
const updateDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  const { title, body, type, requiresSignature, targetType, targetWorkers, targetRoles, status, removeFile } = req.body;

  if (title    !== undefined) doc.title    = title.trim();
  if (body     !== undefined) doc.body     = body;
  if (type     !== undefined) doc.type     = type;
  if (requiresSignature !== undefined)
    doc.requiresSignature = requiresSignature === 'false' ? false : Boolean(requiresSignature);
  if (targetType !== undefined) {
    doc.targetType = targetType;
    const tw = typeof targetWorkers === 'string' ? JSON.parse(targetWorkers || '[]') : (targetWorkers || []);
    const tr = typeof targetRoles   === 'string' ? JSON.parse(targetRoles   || '[]') : (targetRoles   || []);
    doc.targetWorkers = targetType === 'selected' ? tw : [];
    doc.targetRoles   = targetType === 'role'     ? tr : [];
  }
  if (status !== undefined) {
    doc.status = status;
    if (status === 'published' && !doc.publishedAt) doc.publishedAt = new Date();
  }

  // Handle file replacement / removal
  if (removeFile === 'true' || removeFile === true) {
    await deleteFromCloudinary(doc.filePublicId);
    doc.fileUrl = null; doc.fileName = null; doc.filePublicId = null; doc.fileType = null;
  }
  if (req.file) {
    if (doc.filePublicId) await deleteFromCloudinary(doc.filePublicId);
    const result = await uploadToCloudinary(req.file.buffer, 'documents', 'auto');
    doc.fileUrl      = result.secure_url;
    doc.filePublicId = result.public_id;
    doc.fileName     = req.file.originalname;
    doc.fileType     = mimeToFileType(req.file.mimetype);
  }

  await doc.save();
  res.json({ success: true, data: doc });
};

// ── POST /api/documents/:id/publish  (admin) ──────────────────────────────────
const publishDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  if (!doc.title?.trim() || (!doc.body?.trim() && !doc.fileUrl))
    return res.status(400).json({ success: false, message: 'Document must have a title and content (text or file) before publishing' });

  doc.status = doc.status === 'published' ? 'draft' : 'published';
  if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = new Date();
  await doc.save();

  res.json({ success: true, data: doc, message: doc.status === 'published' ? 'Document published' : 'Moved to draft' });
};

// ── DELETE /api/documents/:id  (admin) ────────────────────────────────────────
const deleteDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  await deleteFromCloudinary(doc.filePublicId);
  await DocumentSignature.deleteMany({ document: doc._id });
  await doc.deleteOne();
  res.json({ success: true, message: 'Document deleted' });
};

// ── GET /api/documents/:id/signatures  (admin) ────────────────────────────────
const getSignatures = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  const signatures    = await DocumentSignature.find({ document: doc._id }).sort({ signedAt: -1 }).lean();
  const targetWorkers = await fetchTargetWorkers(doc, req.user.company._id);

  const signedSet = new Set(signatures.map(s => String(s.worker)));
  const unsigned  = targetWorkers.filter(w => !signedSet.has(String(w._id)));

  res.json({ success: true, data: { signatures, unsigned, totalTarget: targetWorkers.length } });
};

// ── POST /api/documents/:id/sign  (public — PIN auth) ─────────────────────────
const signDocument = async (req, res) => {
  const { pin, workerId, signatureName } = req.body;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });
  if (!signatureName?.trim())
    return res.status(400).json({ success: false, message: 'Please type your name to confirm' });

  const worker = await workerByPin(pin);
  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });
  if (workerId && String(worker._id) !== String(workerId))
    return res.status(401).json({ success: false, message: 'PIN does not match this worker' });

  const doc = await Document.findOne({ _id: req.params.id, status: 'published' }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found or not published' });

  if (!isTarget(doc, worker))
    return res.status(403).json({ success: false, message: 'This document was not shared with you' });

  const existing = await DocumentSignature.findOne({ document: doc._id, worker: worker._id }).lean();
  if (existing) return res.json({ success: true, alreadySigned: true, data: existing });

  const sig = await DocumentSignature.create({
    company:       worker.company,
    document:      doc._id,
    worker:        worker._id,
    workerName:    worker.fullName,
    workerRole:    worker.role,
    branchName:    worker.branchId?.name || '',
    signatureName: signatureName.trim(),
    signedAt:      new Date(),
  });
  res.json({ success: true, data: sig, message: 'Document signed successfully' });
};

// ── GET /api/documents/worker  (public — PIN auth) ────────────────────────────
const getWorkerDocuments = async (req, res) => {
  const { pin } = req.query;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await workerByPin(pin);
  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });

  const allDocs = await Document.find({
    company: worker.company,
    status:  'published',
    $or: [
      { targetType: 'all' },
      { targetType: 'selected', targetWorkers: worker._id },
      { targetType: 'role',     targetRoles: { $regex: new RegExp(`^${worker.role}$`, 'i') } },
    ],
  }).select('_id title type requiresSignature publishedAt body fileUrl fileName fileType').sort({ publishedAt: -1 }).lean();

  const sigs = await DocumentSignature.find({ company: worker.company, worker: worker._id })
    .select('document signedAt signatureName').lean();
  const sigMap = {};
  sigs.forEach(s => { sigMap[String(s.document)] = s; });

  const pending = allDocs
    .filter(d => d.requiresSignature && !sigMap[String(d._id)])
    .map(d => ({ ...d, body: undefined }));

  const signed = allDocs
    .filter(d => sigMap[String(d._id)])
    .map(d => ({ ...d, body: undefined, signedAt: sigMap[String(d._id)].signedAt, signatureName: sigMap[String(d._id)].signatureName }));

  res.json({ success: true, data: { pending, signed, worker: { fullName: worker.fullName, role: worker.role } } });
};

// ── GET /api/documents/:id/read  (public — PIN auth) ──────────────────────────
const readDocument = async (req, res) => {
  const { pin } = req.query;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await workerByPin(pin);
  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });

  const doc = await Document.findOne({ _id: req.params.id, status: 'published' }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  if (!isTarget(doc, worker))
    return res.status(403).json({ success: false, message: 'This document was not shared with you' });

  const sig = await DocumentSignature.findOne({ document: doc._id, worker: worker._id }).lean();
  res.json({ success: true, data: { ...doc, alreadySigned: !!sig, signedAt: sig?.signedAt } });
};

// ── GET /api/documents/roles  (admin) — distinct worker roles for targeting ───
const getDistinctRoles = async (req, res) => {
  const cid = req.user.company._id;
  const roles = await Worker.distinct('role', { company: cid, employmentStatus: 'active' });
  res.json({ success: true, data: roles.filter(Boolean).sort() });
};

module.exports = {
  getDocuments, getDocument, createDocument, updateDocument,
  publishDocument, deleteDocument, getSignatures,
  signDocument, getWorkerDocuments, readDocument, getDistinctRoles,
};
