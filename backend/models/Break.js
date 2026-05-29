const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const auditEntrySchema = new mongoose.Schema({
  action:    { type: String },
  timestamp: { type: Date, default: Date.now },
  by:        { type: String, default: 'system' },  // 'worker' | 'system' | 'cron' | 'supervisor'
  notes:     { type: String },
}, { _id: false });

const breakSchema = new mongoose.Schema({
  company:    { type: ObjectId, ref: 'Company', required: true },
  branchId:   { type: ObjectId, ref: 'Branch',  required: true },
  branchName: { type: String },
  worker:     { type: ObjectId, ref: 'Worker',  required: true },
  workerName: { type: String },
  workerRole: { type: String },

  date:      { type: String, required: true },   // 'YYYY-MM-DD'
  breakType: {
    type: String,
    enum: ['morning', 'afternoon', 'night'],
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'overstayed', 'missed'],
    default: 'active',
  },

  allowedMinutes: { type: Number, required: true },
  windowStart:    { type: String },   // 'HH:MM' UTC
  windowEnd:      { type: String },   // 'HH:MM' UTC

  startTime:     { type: Date },
  endTime:       { type: Date },
  actualMinutes: { type: Number, default: 0 },
  excessMinutes: { type: Number, default: 0 },

  supervisorNotified: { type: Boolean, default: false },

  auditLog: [auditEntrySchema],
}, { timestamps: true });

// Enforce one break per worker per type per day
breakSchema.index({ company: 1, worker: 1, date: 1, breakType: 1 }, { unique: true });
breakSchema.index({ company: 1, branchId: 1, date: 1 });
breakSchema.index({ status: 1, startTime: 1 });

module.exports = mongoose.model('Break', breakSchema);
