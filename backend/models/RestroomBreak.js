const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const restroomBreakSchema = new mongoose.Schema({
  company:      { type: ObjectId, ref: 'Company', required: true },
  branchId:     { type: ObjectId, ref: 'Branch' },
  branchName:   { type: String },
  worker:       { type: ObjectId, ref: 'Worker', required: true },
  workerName:   { type: String },
  workerRole:   { type: String },

  date:            { type: String, required: true },   // 'YYYY-MM-DD'
  startTime:       { type: Date,   required: true },
  endTime:         { type: Date,   default: null },

  allowedMinutes:  { type: Number, default: 2 },
  actualMinutes:   { type: Number, default: 0 },
  excessMinutes:   { type: Number, default: 0 },
  deductionPerMin: { type: Number, default: 500 },     // ₦ per extra minute

  status: {
    type:    String,
    enum:    ['active', 'completed', 'overstayed'],
    default: 'active',
  },

  deductionCreated: { type: Boolean, default: false },
  deductionAmount:  { type: Number,  default: 0 },

}, { timestamps: true });

restroomBreakSchema.index({ company: 1, worker: 1, date: 1 });
restroomBreakSchema.index({ company: 1, branchId: 1, date: 1 });
restroomBreakSchema.index({ status: 1, startTime: 1 });

module.exports = mongoose.model('RestroomBreak', restroomBreakSchema);
