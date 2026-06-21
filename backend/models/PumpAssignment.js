const mongoose = require('mongoose');
const { Schema } = mongoose;

const assignedPumpSchema = new Schema({
  pumpId:      { type: Schema.Types.ObjectId, ref: 'Pump' },
  pumpNumber:  { type: Number },
  pumpName:    { type: String },
  productType: { type: String },
  openingMeter: { type: Number },
  closingMeter: { type: Number },
  volume:       { type: Number },
}, { _id: false });

const pumpAssignmentSchema = new Schema({
  company:         { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:        { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  branchName:      { type: String },
  island:          { type: Schema.Types.ObjectId, ref: 'PumpIsland' },
  islandName:      { type: String },
  includesGas:     { type: Boolean, default: false },
  productTypes:    [{ type: String }],
  pump:            { type: Schema.Types.ObjectId, ref: 'Pump' },
  pumpNumber:      { type: Number },
  pumpName:        { type: String },
  productType:     { type: String },
  // All pumps this worker covers on the primary island
  assignedPumps:   [assignedPumpSchema],
  // Secondary islands distributed when islands > workers
  additionalIslands: [{
    island:       { type: Schema.Types.ObjectId, ref: 'PumpIsland' },
    islandName:   { type: String },
    includesGas:  { type: Boolean, default: false },
    productTypes: [{ type: String }],
    assignedPumps: [assignedPumpSchema],
  }],
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
