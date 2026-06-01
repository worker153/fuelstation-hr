const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const documentSchema = new mongoose.Schema({
  company:   { type: ObjectId, ref: 'Company', required: true },
  title:     { type: String, required: true, trim: true },
  body:      { type: String, default: '' },       // HTML content from rich editor
  type: {
    type: String,
    enum: ['handbook', 'policy', 'notice', 'agreement', 'other'],
    default: 'handbook',
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
  },
  requiresSignature: { type: Boolean, default: true },

  // Who this document is shared with
  targetType:    { type: String, enum: ['all', 'selected'], default: 'all' },
  targetWorkers: [{ type: ObjectId, ref: 'Worker' }],

  createdBy:   { type: ObjectId, ref: 'User' },
  publishedAt: { type: Date },
}, { timestamps: true });

documentSchema.index({ company: 1, status: 1 });
documentSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
