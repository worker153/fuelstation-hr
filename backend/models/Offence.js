const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const offenceSchema = new mongoose.Schema({
  company:     { type: ObjectId, ref: 'Company', required: true },
  worker:      { type: ObjectId, ref: 'Worker',  required: true },
  workerName:  { type: String, trim: true },
  workerRole:  { type: String, trim: true },
  branch:      { type: String, trim: true },
  branchId:    { type: ObjectId, ref: 'Branch' },

  date: { type: Date, default: Date.now, required: true },

  offenceType: {
    type: String,
    enum: [
      'late_arrival', 'absent_without_notice', 'improper_uniform',
      'rude_to_customer', 'cash_shortage', 'fuel_shortage',
      'negligence', 'theft_fraud', 'disobedience', 'mobile_phone_misuse',
      'fighting_misconduct', 'damage_to_property', 'abandoning_post',
      'insubordination', 'sleeping_on_duty', 'other'
    ],
    required: true,
  },

  // Free-text details of what happened
  description: { type: String, trim: true },

  severity: {
    type: String,
    enum: ['minor', 'moderate', 'serious', 'gross'],
    required: true,
  },

  action: {
    type: String,
    enum: ['verbal_warning', 'written_warning', 'suspension', 'deduction', 'dismissal', 'none'],
    default: 'verbal_warning',
  },

  deductionAmount: { type: Number, default: 0 },   // only when action = 'deduction'
  witness:         { type: String, trim: true },    // witness name (optional)

  // Who booked it
  recordedBy:     { type: ObjectId, ref: 'User' },
  recordedByName: { type: String, trim: true },

  // Resolution (admin can resolve/dismiss an offence)
  status: {
    type: String,
    enum: ['active', 'appealed', 'dismissed', 'resolved'],
    default: 'active',
  },
  resolution:  { type: String, trim: true },
  resolvedBy:  { type: ObjectId, ref: 'User' },
  resolvedAt:  Date,

}, { timestamps: true });

offenceSchema.index({ company: 1, worker: 1 });
offenceSchema.index({ company: 1, branchId: 1 });
offenceSchema.index({ company: 1, date: -1 });
offenceSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('Offence', offenceSchema);
