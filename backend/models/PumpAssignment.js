const mongoose = require('mongoose');
const { Schema } = mongoose;

const pumpAssignmentSchema = new Schema({
  company:         { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:        { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  branchName:      { type: String },
  pump:            { type: Schema.Types.ObjectId, ref: 'Pump',    required: true },
  pumpNumber:      { type: Number },
  pumpName:        { type: String },
  productType:     { type: String },
  worker:          { type: Schema.Types.ObjectId, ref: 'Worker',  required: true },
  workerName:      { type: String },
  workerRole:      { type: String },
  date:            { type: String, required: true },   // 'YYYY-MM-DD'
  shiftName:       { type: String },
  assignedAt:      { type: Date, default: Date.now },
  isOverride:      { type: Boolean, default: false },
  overrideBy:      { type: Schema.Types.ObjectId, ref: 'User' },
  overrideByName:  { type: String },
  overrideReason:  { type: String },
  status:          { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  openingMeter:    { type: Number },
  closingMeter:    { type: Number },
  volume:          { type: Number },
  meterError:      { type: String },
}, { timestamps: true });

pumpAssignmentSchema.index({ company: 1, branchId: 1, date: 1 });
pumpAssignmentSchema.index({ company: 1, worker: 1, date: 1 });
pumpAssignmentSchema.index({ company: 1, pump: 1, date: 1 });

module.exports = mongoose.model('PumpAssignment', pumpAssignmentSchema);
