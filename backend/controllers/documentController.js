const Document          = require('../models/Document');
const DocumentSignature = require('../models/DocumentSignature');
const Worker            = require('../models/Worker');

// ─── helper: verify PIN and return worker ─────────────────────────────────────
async function workerByPin(pin) {
  if (!pin) return null;
  return Worker.findOne({ pin: String(pin).trim(), employmentStatus: 'active' }).lean();
}

// ─── helper: is this worker a target of this document? ───────────────────────
function isTarget(doc, workerId) {
  if (doc.targetType === 'all') return true;
  return doc.targetWorkers.some(id => String(id) === String(workerId));
}

// ─── GET /api/documents  (admin) ─────────────────────────────────────────────
const getDocuments = async (req, res) => {
  const cid  = req.user.company._id;
  const docs = await Document.find({ company: cid })
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .lean();

  // Attach signature counts
  const counts = await DocumentSignature.aggregate([
    { $match: { company: cid } },
    { $group: { _id: '$document', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach(c => { countMap[String(c._id)] = c.count; });

  const data = docs.map(d => ({
    ...d,
    signatureCount: countMap[String(d._id)] || 0,
  }));

  res.json({ success: true, data });
};

// ─── GET /api/documents/:id  (admin) ─────────────────────────────────────────
const getDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('createdBy', 'name')
    .populate('targetWorkers', 'fullName role branchId')
    .lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  res.json({ success: true, data: doc });
};

// ─── POST /api/documents  (admin) ────────────────────────────────────────────
const createDocument = async (req, res) => {
  const { title, body, type, requiresSignature, targetType, targetWorkers } = req.body;
  if (!title?.trim())
    return res.status(400).json({ success: false, message: 'Title is required' });

  const doc = await Document.create({
    company:           req.user.company._id,
    title:             title.trim(),
    body:              body || '',
    type:              type || 'handbook',
    requiresSignature: requiresSignature !== false,
    targetType:        targetType || 'all',
    targetWorkers:     targetType === 'selected' ? (targetWorkers || []) : [],
    createdBy:         req.user._id,
    status:            'draft',
  });
  res.status(201).json({ success: true, data: doc });
};

// ─── PUT /api/documents/:id  (admin) ─────────────────────────────────────────
const updateDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  const { title, body, type, requiresSignature, targetType, targetWorkers, status } = req.body;

  if (title !== undefined) doc.title = title.trim();
  if (body  !== undefined) doc.body  = body;
  if (type  !== undefined) doc.type  = type;
  if (requiresSignature !== undefined) doc.requiresSignature = requiresSignature;
  if (targetType  !== undefined) doc.targetType = targetType;
  if (targetWorkers !== undefined) doc.targetWorkers = targetType === 'selected' ? targetWorkers : [];
  if (status !== undefined) {
    doc.status = status;
    if (status === 'published' && !doc.publishedAt) doc.publishedAt = new Date();
  }

  await doc.save();
  res.json({ success: true, data: doc });
};

// ─── POST /api/documents/:id/publish  (admin) ────────────────────────────────
const publishDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  if (!doc.title?.trim() || !doc.body?.trim())
    return res.status(400).json({ success: false, message: 'Document must have a title and content before publishing' });

  doc.status      = doc.status === 'published' ? 'draft' : 'published';
  if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = new Date();
  await doc.save();

  res.json({ success: true, data: doc, message: doc.status === 'published' ? 'Document published' : 'Moved to draft' });
};

// ─── DELETE /api/documents/:id  (admin) ──────────────────────────────────────
const deleteDocument = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  await DocumentSignature.deleteMany({ document: doc._id });
  await doc.deleteOne();
  res.json({ success: true, message: 'Document deleted' });
};

// ─── GET /api/documents/:id/signatures  (admin) ──────────────────────────────
const getSignatures = async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, company: req.user.company._id }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  const signatures = await DocumentSignature.find({ document: doc._id }).sort({ signedAt: -1 }).lean();

  // Get all target workers for "unsigned" list
  let targetWorkers = [];
  if (doc.targetType === 'all') {
    targetWorkers = await Worker.find({ company: req.user.company._id, employmentStatus: 'active' })
      .select('_id fullName role branchId').populate('branchId', 'name').lean();
  } else {
    targetWorkers = await Worker.find({ _id: { $in: doc.targetWorkers }, company: req.user.company._id })
      .select('_id fullName role branchId').populate('branchId', 'name').lean();
  }

  const signedSet = new Set(signatures.map(s => String(s.worker)));
  const unsigned  = targetWorkers.filter(w => !signedSet.has(String(w._id)));

  res.json({ success: true, data: { signatures, unsigned, totalTarget: targetWorkers.length } });
};

// ─── POST /api/documents/:id/sign  (public — PIN auth) ───────────────────────
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

  if (!isTarget(doc, worker._id))
    return res.status(403).json({ success: false, message: 'This document was not shared with you' });

  // Idempotent — return existing signature if already signed
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

// ─── GET /api/documents/worker  (public — PIN auth) ──────────────────────────
// Returns: pending (unread/unsigned) + signed documents for this worker
const getWorkerDocuments = async (req, res) => {
  const { pin } = req.query;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await workerByPin(pin);
  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });

  // All published docs targeting this worker
  const allDocs = await Document.find({
    company: worker.company,
    status:  'published',
    $or: [
      { targetType: 'all' },
      { targetType: 'selected', targetWorkers: worker._id },
    ],
  }).select('_id title type requiresSignature publishedAt body').sort({ publishedAt: -1 }).lean();

  // Worker's existing signatures
  const sigs = await DocumentSignature.find({
    company: worker.company,
    worker:  worker._id,
  }).select('document signedAt signatureName').lean();
  const sigMap = {};
  sigs.forEach(s => { sigMap[String(s.document)] = s; });

  const pending = allDocs
    .filter(d => d.requiresSignature && !sigMap[String(d._id)])
    .map(d => ({ ...d, body: undefined }));  // don't send body in list

  const signed = allDocs
    .filter(d => sigMap[String(d._id)])
    .map(d => ({
      ...d,
      body: undefined,
      signedAt:      sigMap[String(d._id)].signedAt,
      signatureName: sigMap[String(d._id)].signatureName,
    }));

  res.json({ success: true, data: { pending, signed, worker: { fullName: worker.fullName, role: worker.role } } });
};

// ─── GET /api/documents/:id/read  (public — PIN auth) ────────────────────────
// Returns full document body for reading before signing
const readDocument = async (req, res) => {
  const { pin } = req.query;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await workerByPin(pin);
  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });

  const doc = await Document.findOne({ _id: req.params.id, status: 'published' }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  if (!isTarget(doc, worker._id))
    return res.status(403).json({ success: false, message: 'This document was not shared with you' });

  // Check if already signed
  const sig = await DocumentSignature.findOne({ document: doc._id, worker: worker._id }).lean();

  res.json({ success: true, data: { ...doc, alreadySigned: !!sig, signedAt: sig?.signedAt } });
};

module.exports = {
  getDocuments, getDocument, createDocument, updateDocument,
  publishDocument, deleteDocument, getSignatures,
  signDocument, getWorkerDocuments, readDocument,
};
