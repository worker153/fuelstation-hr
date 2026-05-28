const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  company: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Company',
    required: true
  },
  name:    { type: String, required: [true, 'Branch name is required'], trim: true },
  address: { type: String, trim: true },
  location: {
    lat:       Number,
    lng:       Number,
    formatted: String,
    plusCode:  String
  },
  phone:    { type: String, trim: true },
  manager:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Legacy single-rule (kept for backward compat — controller prefers attendanceRules)
  attendanceSettings: {
    clockInDeadline:              { type: String, default: '' },
    absentThreshold:              { type: String, default: '' },
    shiftEnd:                     { type: String, default: '' },
    lateDeductionAmount:          { type: Number, default: 0 },
    absentDeductionAmount:        { type: Number, default: 0 },
    earlyDepartureDeductionAmount:{ type: Number, default: 0 },
    workDays:                     { type: [Number], default: [1,2,3,4,5,6] },
  },

  // Per-role rules — role='default' applies to any role not specifically listed
  attendanceRules: [{
    role:                         { type: String, default: 'default' },
    clockInDeadline:              { type: String, default: '' },
    absentThreshold:              { type: String, default: '' },
    shiftEnd:                     { type: String, default: '' },
    lateDeductionAmount:          { type: Number, default: 0 },
    absentDeductionAmount:        { type: Number, default: 0 },
    earlyDepartureDeductionAmount:{ type: Number, default: 0 },
    noClockInDeductionAmount:     { type: Number, default: 0 },
    workDays:                     { type: [Number], default: [1,2,3,4,5,6] },
  }],
}, { timestamps: true });

branchSchema.index({ company: 1 });
branchSchema.index({ company: 1, isActive: 1 });

module.exports = mongoose.model('Branch', branchSchema);
