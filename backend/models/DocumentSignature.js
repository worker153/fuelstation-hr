const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const signatureSchema = new mongoose.Schema({
  company:       { type: ObjectId, ref: 'Company', required: true },
  document:      { type: ObjectId, ref: 'Document', required: true },
  worker:        { type: ObjectId, ref: 'Worker',   required: true },
  workerName:    { type: String },
  workerRole:    { type: String },
  branchName:    { type: String },
  signatureName: { type: String },   // worker typed their name to confirm
  signedAt:      { type: Date, default: Date.now },
}, { timestamps: true });

// One signature per worker per document
signatureSchema.index({ document: 1, worker: 1 }, { unique: true });
signatureSchema.index({ company: 1, worker: 1 });
signatureSchema.index({ company: 1, document: 1 });

module.exports = mongoose.model('DocumentSignature', signatureSchema);
