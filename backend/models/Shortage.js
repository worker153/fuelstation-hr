const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const shortageSchema = new mongoose.Schema({
  company:    { type: ObjectId, ref: 'Company', required: true },
  branchId:   { type: ObjectId, ref: 'Branch' },
  branchName: { type: String, trim: true },

  // Worker snapshot
  worker:     { type: ObjectId, ref: 'Worker', required: true },
  workerName: { type: String, trim: true },
  workerRole: { type: String, trim: true },

  // Period
  month:  { type: Number, required: true, min: 1, max: 12 },
  year:   { type: Number, required: true },
  date:   { type: Date },           // specific incident date (optional)

  amount: { type: Number, required: true, min: 0 },
  notes:  { type: String, trim: true },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  submittedBy:      { type: ObjectId, ref: 'User' },
  reviewedBy:       { type: ObjectId, ref: 'User' },
  reviewedAt:       Date,
  rejectionReason:  { type: String, trim: true }
}, { timestamps: true });

shortageSchema.index({ company: 1, status: 1 });
shortageSchema.index({ company: 1, worker: 1, month: 1, year: 1 });
shortageSchema.index({ company: 1, branchId: 1, month: 1, year: 1 });

module.exports = mongoose.model('Shortage', shortageSchema);
